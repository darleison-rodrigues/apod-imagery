import React from 'react';
import './App.css';
import ClockworkTimeline from './components/ClockworkTimeline';
import ChromaDBSearch from './components/ChromaDBSearch';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>APOD Image Detective</h1>
      </header>
      <main className="main-content">
        <ChromaDBSearch />
        <ClockworkTimeline />
      </main>
    </div>
  );
}

export default App;
