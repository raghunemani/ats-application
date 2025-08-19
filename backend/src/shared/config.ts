export const config = {
  azure: {
    sql: {
      connectionString: process.env.AZURE_SQL_CONNECTION_STRING || '',
    },
    storage: {
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
      containerName: 'resumes',
    },
    search: {
      endpoint: process.env.AZURE_SEARCH_ENDPOINT || '',
      apiKey: process.env.AZURE_SEARCH_API_KEY || '',
      indexName: 'candidates-index',
    },
    openai: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: process.env.AZURE_OPENAI_API_KEY || '',
    },
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
  },
};