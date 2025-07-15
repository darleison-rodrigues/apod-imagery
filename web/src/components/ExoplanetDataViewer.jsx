import React, { useState, useEffect } from 'react';

const ExoplanetDataViewer = () => {
  const [exoplanets, setExoplanets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchExoplanetData = async () => {
      try {
        // NASA Exoplanet Archive API endpoint for exoplanets table
        // We'll fetch a small subset of data for demonstration
        const apiUrl = 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI?table=exoplanets&format=json&select=pl_name,pl_orbper,pl_bmassj,pl_radj,st_dist,st_teff,st_mass,st_rad&order=pl_name&limit=20';
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setExoplanets(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchExoplanetData();
  }, []);

  if (loading) {
    return <div>Loading exoplanet data...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Exoplanet Data Viewer</h2>
      {exoplanets.length === 0 ? (
        <p>No exoplanet data found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f2f2f2' }}>
              <th style={tableHeaderStyle}>Planet Name</th>
              <th style={tableHeaderStyle}>Orbital Period (days)</th>
              <th style={tableHeaderStyle}>Mass (Jupiter)</th>
              <th style={tableHeaderStyle}>Radius (Jupiter)</th>
              <th style={tableHeaderStyle}>Star Distance (pc)</th>
              <th style={tableHeaderStyle}>Star Temp (K)</th>
              <th style={tableHeaderStyle}>Star Mass (Solar)</th>
              <th style={tableHeaderStyle}>Star Radius (Solar)</th>
            </tr>
          </thead>
          <tbody>
            {exoplanets.map((planet, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={tableCellStyle}>{planet.pl_name}</td>
                <td style={tableCellStyle}>{planet.pl_orbper?.toFixed(2)}</td>
                <td style={tableCellStyle}>{planet.pl_bmassj?.toFixed(2)}</td>
                <td style={tableCellStyle}>{planet.pl_radj?.toFixed(2)}</td>
                <td style={tableCellStyle}>{planet.st_dist?.toFixed(2)}</td>
                <td style={tableCellStyle}>{planet.st_teff?.toFixed(2)}</td>
                <td style={tableCellStyle}>{planet.st_mass?.toFixed(2)}</td>
                <td style={tableCellStyle}>{planet.st_rad?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const tableHeaderStyle = {
  padding: '8px',
  border: '1px solid #ddd',
  textAlign: 'left',
};

const tableCellStyle = {
  padding: '8px',
  border: '1px solid #ddd',
  textAlign: 'left',
};

export default ExoplanetDataViewer;
