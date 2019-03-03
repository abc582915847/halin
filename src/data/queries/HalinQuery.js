import pkg from '../../../package.json';
import _ from 'lodash';

class HalinQuery {
    constructor(props) {
        if (!props.query || !props.columns) {
            throw new Error('All queries require columns and query');
        }

        this.query = HalinQuery.disclaim(props.query);
        this.columns = props.columns;
        this.dependency = props.dependency || null;
        this.rate = props.rate || 1000;
        this.parameters = props.parameters || {};
        this.legendOnlyColumns = props.legendOnlyColumns || [];

        this.validate();
    }

    validate() {
        if (_.isNil(this.columns) || this.columns.length === 0) {
            throw new Error(`Missing columns on query ${this.query}`);
        }

        this.columns.forEach((column, i) => {
            if (!column || !column.accessor) {
                throw new Error(`Column ${i} of query ${this.query} is invalid or missing accessor`);
            }
        });

        if (this.rate < 0) {
            throw new Error('Rate must be positive');
        }

        return true;
    }

    static disclaim(query) {
        if (query.indexOf(HalinQuery.disclaimer) > -1) {
            return query;
        }   
    
        return `WITH ${HalinQuery.disclaimer} ${query}`;
    }
};

HalinQuery.disclaimer = `'This query was run by Halin v${pkg.version}' AS disclaimer\n`;
HalinQuery.transactionConfig = {
    timeout: 5000,
    metadata: {
        app: `halin-v${pkg.version}`,
        type: 'user-direct',
    },
};

export default HalinQuery;
