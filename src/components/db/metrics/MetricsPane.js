import React, { Component } from 'react';
import uuid from 'uuid';
import moment from 'moment';
import hoc from '../../higherOrderComponents';
import _ from 'lodash';
import Spinner from '../../ui/Spinner';
import sentry from '../../api/sentry';
import queryLibrary from '../../data/queries/query-library';
import { Grid, Dropdown, Message, Form } from 'semantic-ui-react';
import unflatten from './unflatten';
import MetricsChart from './MetricsChart';
import MetricDescription from './MetricDescription';

const RECORDS = 100;
const MAX_AGE = 2 * 1000;

const code = text => <span style={{fontFamily:'monospace'}}>{text}</span>;

class MetricsPane extends Component {
    state = {
        key: uuid.v4(),
        metrics: null,
        loading: false,
        activeMetric: null,
        menu: {},
        observations: RECORDS,
        dateFormat: 'MMMM Do YYYY, h:mm:ss a',
    };

    componentDidMount() {
        return this.props.node.getAvailableMetrics()
            .then(metrics => {
                // Convert to the format that the dropdown menu wants.
                const metricOptions = _.sortBy(_.uniqBy(metrics.map(m => ({
                    key: m.name, 
                    text: m.name, 
                    value: m.name,
                })), 'key'), 'key');

                const flatMap = {};
                metricOptions.forEach(mo => flatMap[mo.key] = mo.key);

                const menu = unflatten(flatMap);

                let defaultMetric = 'neo4j.bolt.connections_opened';
                
                if (metrics.filter(m => m.name === defaultMetric).length === 0) {
                    defaultMetric = _.get(metrics[0], 'name');
                }
               
                // Sorted and unique options
                this.setState({ 
                    metrics: metricOptions, 
                    menu,
                    activeMetric: defaultMetric,
                });

                if (defaultMetric) {
                    return this.getMetric(defaultMetric);
                }
                return null;
            });
    }

    selectMetric = (event, data) => {
        const promise = this.getMetric(data.value);
        this.setState({
            activeMetric: data.value,
        });
        return promise;
    }

    haveCurrentMetricData(metric) {
        const data = this.state[metric];
        if (!data) { return false; }
        const lastObsTime = data[data.length - 1].t.getTime();
        const utcTimeNow = moment.utc().valueOf();

        if (utcTimeNow - lastObsTime < MAX_AGE) {
            return true;
        }

        sentry.fine(`Metric data for ${metric} aged out; ${moment.utc(lastObsTime).format()} vs. ${moment.utc(utcTimeNow).format()}`);
        return false;
    }

    convertMetricTimestampToLocalDate(val) {
        // Weird gotcha that is not documented:
        // Timings in the metrics file are given in **seconds since the epoch** not ms.
        // ¯\_(ツ)_/¯ - Also remember these are UTC timestamps, not local TZ.
        const msSinceEpoch = val * 1000;
        const utc = moment.utc(msSinceEpoch);
        return utc.local().toDate();
    }

    getMetric(metric) {
        if (this.haveCurrentMetricData(metric)) {
            return Promise.resolve(this.state[metric]);
        }

        this.setState({ loading: true });

        return this.props.node.run(queryLibrary.GET_METRIC.query, { metric, last: this.state.observations })
            .then(data => data.records.map(r => ({
                t: this.convertMetricTimestampToLocalDate(r.get('timestamp').toNumber()),
                metric: r.get('metric'),
                map: r.get('map'),
            })).sort((a, b) => a.t - b.t)) // Keep sorted by date
            .then(data => {
                this.setState({ [metric]: data, loading: false, error: null });
                return data;
            })
            .catch(err => {
                sentry.reportError(`Failed to fetch metric ${metric}`, err);
                this.setState({
                    [metric]: [],
                    loading: false,
                    error: err,
                });
                return [];
            });
    }

    render() {
        return (
            <div className='MetricsPane'>
                <Grid>
                    <Grid.Row columns={12}>
                        <Grid.Column width={4}>
                            <Form.Group inline>
                                <Form.Field>
                                    <label>Select Metric</label>
                                    <Dropdown placeholder='Neo4j Metric Name'
                                        search selection
                                        loading={_.isNil(this.state.metrics)}
                                        allowAdditions={false}
                                        upward={false}
                                        onChange={this.selectMetric}
                                        options={this.state.metrics} />
                                </Form.Field>
                            </Form.Group>

                            <Message info>Metrics are generated by the database and not sampled in real time.  For more information, 
                                see the <a href='https://neo4j.com/docs/operations-manual/current/monitoring/metrics/expose/#metrics-enable'>
                                Neo4j operations manual</a>
                            </Message>
                        </Grid.Column>
                        <Grid.Column width={8}>
                            { this.content() }
                        </Grid.Column>
                    </Grid.Row>
                </Grid>
            </div>
        )
    }

    getChartStart() {
        // Data is kept sorted.
        const arr = this.state[this.state.activeMetric] || [];
        const v = _.get(arr[0], 't');
        return v ? v.getTime() : new Date();
    }

    getChartEnd() {
        // Data is kept sorted.
        const arr = this.state[this.state.activeMetric] || [];
        const v = _.get(arr[arr.length-1], 't');
        return v ? v.getTime() : new Date();
    }

    describeDateRange() {
        return (
            <h4>
                <strong>{moment(this.getChartStart()).format(this.state.dateFormat)}</strong>
                &nbsp;-&nbsp;
                <strong>{moment(this.getChartEnd()).format(this.state.dateFormat)}</strong>
            </h4>
        );
    }

    isLoading() {
        return (this.state.loading || 
            (this.state.activeMetric && _.isNil(this.state[this.state.activeMetric])));
    }

    renderMetricsChart() {
        if (this.state.error) {
            const err = `${this.state.error}`;

            return (
                <Grid.Row columns={1}>
                    <Grid.Column>
                        <Message negative>
                            <Message.Header>Error Fetching Metric</Message.Header>
                            <p>{err}</p>
                        </Message>
                    </Grid.Column>
                </Grid.Row>
            );
        }

        return (
            <div>
                <Grid.Row columns={1}>
                    <Grid.Column>{ this.describeDateRange() }</Grid.Column>
                </Grid.Row>

                <Grid.Row columns={1}>
                    <MetricsChart metric={this.state.activeMetric} data={this.state[this.state.activeMetric]} />
                </Grid.Row> 
            </div>
        );
    }

    content() {
        if (!this.state.activeMetric) {
            return <Message>Please select a metric from the drop-down above</Message>
        }

        return (
            <div className='content' style={{ paddingTop: '15px', paddingBottom: '15px' }}>
                <Grid>
                    <Grid.Row columns={1}>
                        <MetricDescription metric={this.state.activeMetric} />
                    </Grid.Row>

                    { this.isLoading() ? <Spinner active='true' /> : 
                        this.renderMetricsChart() }
                </Grid>
            </div>
        );
    }
}

const compatCheckFn = ctx =>
    Promise.resolve(
        ctx.supportsAPOC() && 
        ctx.supportsMetrics() && 
        ctx.supportsLogStreaming());

// What to tell the user if the compatibility checks aren't satisfied.
const notSupported = () => {
    return (
        <Message warning>
            <Message.Header>Additional Configuration Needed</Message.Header>
            <Message.Content>
                <p>In order to view metrics in Halin, some additional configuration of your Neo4j
                   instance is necessary.
                </p>

                <ul style={{textAlign: 'left'}}>
                    <li>Ensure that your Neo4j instance <a href='https://neo4j.com/docs/operations-manual/current/monitoring/metrics/expose/#metrics-csv'>exposes CSV metrics</a>. 
                    This is on by default in many versions of Neo4j.</li>
                    <li>Ensure that you have <a href='https://github.com/neo4j-contrib/neo4j-apoc-procedures/releases'>APOC installed</a>&nbsp;
                    <strong>and that it is a recent version</strong> higher than 3.5.0.3 for Neo4j 3.5, or 3.4.0.6 for Neo4j 3.4</li>
                    <li>Ensure that your {code('neo4j.conf')} includes {code('apoc.import.file.enabled=true')}, which
                    will permit access to the metrics.
                    </li>
                </ul>

            </Message.Content>
        </Message>            
    );
}

export default hoc.compatibilityCheckableComponent(
    MetricsPane,
    compatCheckFn,
    notSupported);
