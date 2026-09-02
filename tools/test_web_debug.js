const websearch_query = require('../src/services/websearch');

(async () => {
    try {
        console.log('Starting test search...');
        const results = await websearch_query('test query');
        console.log('Results:', JSON.stringify(results, null, 2));
    } catch (error) {
        console.error('CAUGHT ERROR:', error.message);
        console.error(error.stack);
    }
})();
