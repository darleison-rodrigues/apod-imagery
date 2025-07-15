import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './ExoplanetViewer.css';

const ExoplanetViewer = () => {
  const svgRef = useRef();

  // Sample data (replace with actual data loaded from CSV later)
  const exoplanetData = [
    { pl_name: 'AU Mic b', hostname: 'AU Mic', pl_bmasse: 6.2, pl_rade: 3.96, discoverymethod: 'Transit' },
    { pl_name: 'AU Mic c', hostname: 'AU Mic', pl_bmasse: 7.3, pl_rade: 2.52, discoverymethod: 'Transit' },
    { pl_name: 'BD+05 4868 A b', hostname: 'BD+05 4868 A', pl_bmasse: 19.5, pl_rade: 6.2, discoverymethod: 'Transit' },
    { pl_name: 'BD-14 3065 b', hostname: 'BD-14 3065 A', pl_bmasse: 3932, pl_rade: 21.59, discoverymethod: 'Transit' },
    { pl_name: 'Kepler-186 f', hostname: 'Kepler-186', pl_bmasse: 1.4, pl_rade: 1.11, discoverymethod: 'Transit' },
    { pl_name: 'Proxima Cen b', hostname: 'Proxima Cen', pl_bmasse: 1.27, pl_rade: 1.07, discoverymethod: 'Radial Velocity' },
    { pl_name: 'TRAPPIST-1 e', hostname: 'TRAPPIST-1', pl_bmasse: 0.77, pl_rade: 0.92, discoverymethod: 'Transit' },
    { pl_name: 'HD 209458 b', hostname: 'HD 209458', pl_bmasse: 221, pl_rade: 13.8, discoverymethod: 'Transit' },
  ];

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const width = 800;
    const height = 500;
    const margin = { top: 20, right: 30, bottom: 60, left: 80 };

    svg.attr("width", width).attr("height", height);

    const xScale = d3.scaleLog()
      .domain([0.1, d3.max(exoplanetData, d => d.pl_bmasse) * 1.1]) // Log scale for mass
      .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLog()
      .domain([0.1, d3.max(exoplanetData, d => d.pl_rade) * 1.1]) // Log scale for radius
      .range([height - margin.bottom, margin.top]);

    // Clear previous render
    svg.selectAll("*").remove();

    // Add X axis
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(5, ".1s"))
      .append("text")
      .attr("x", width / 2)
      .attr("y", margin.bottom - 10)
      .attr("fill", "black")
      .attr("text-anchor", "middle")
      .text("Planet Mass (Earth Masses)");

    // Add Y axis
    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(5, ".1s"))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left + 20)
      .attr("x", -height / 2)
      .attr("fill", "black")
      .attr("text-anchor", "middle")
      .text("Planet Radius (Earth Radii)");

    // Color scale for discovery method
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(exoplanetData.map(d => d.discoverymethod));

    // Add dots
    svg.append("g")
      .selectAll("dot")
      .data(exoplanetData)
      .enter()
      .append("circle")
      .attr("cx", d => xScale(d.pl_bmasse))
      .attr("cy", d => yScale(d.pl_rade))
      .attr("r", 5)
      .style("fill", d => colorScale(d.discoverymethod))
      .style("opacity", 0.7);

  }, [exoplanetData]);

  return (
    <div className="exoplanet-viewer-container">
      <h2>Exoplanet Mass-Radius Diagram</h2>
      <svg ref={svgRef}></svg>
    </div>
  );
};

export default ExoplanetViewer;
