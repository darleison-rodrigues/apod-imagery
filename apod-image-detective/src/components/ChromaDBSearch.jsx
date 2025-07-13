import React, { useState } from 'react';

const ChromaDBSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);

    // Placeholder for API call to a backend that queries ChromaDB
    try {
      // In a real application, this would be an API call to your backend
      // const response = await fetch('/api/chromadb-search', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({ query }),
      // });
      // if (!response.ok) {
      //   throw new Error(`HTTP error! status: ${response.status}`);
      // }
      // const data = await response.json();
      // setResults(data.results);

      // Mock data for demonstration
      setTimeout(() => {
        if (query.toLowerCase().includes('galaxy')) {
          setResults([
            { title: 'Andromeda Galaxy', score: 0.95, description: 'A spiral galaxy approximately 2.5 million light-years from Earth.' },
            { title: 'Milky Way Galaxy', score: 0.88, description: 'The galaxy containing our Solar System.' },
          ]);
        } else if (query.toLowerCase().includes('nebula')) {
          setResults([
            { title: 'Orion Nebula', score: 0.92, description: 'A diffuse nebula situated in the Milky Way, south of Orions Belt.' },
            { title: 'Crab Nebula', score: 0.85, description: 'A supernova remnant and pulsar wind nebula in the constellation of Taurus.' },
          ]);
        } else {
          setResults([
            { title: 'No specific results for this query.', score: 0.0, description: 'Try "galaxy" or "nebula".' }
          ]);
        }
        setLoading(false);
      }, 1000);

    } catch (e) {
      setError(`Failed to fetch search results: ${e.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="chromadb-search-container">
      <h2>Semantic Search (ChromaDB)</h2>
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search APOD descriptions (e.g., galaxy, nebula)"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p className="error-message">{error}</p>}

      {results.length > 0 && (
        <div className="search-results">
          <h3>Results:</h3>
          <ul>
            {results.map((result, index) => (
              <li key={index}>
                <strong>{result.title}</strong> (Score: {result.score.toFixed(2)})
                <p>{result.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ChromaDBSearch;
