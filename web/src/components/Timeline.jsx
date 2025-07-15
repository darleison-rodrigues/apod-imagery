import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { animate, stagger, createTimeline  } from 'animejs';
import {  } from 'animejs';
const Timeline = () => {
  const svgRef = useRef();

  useEffect(() => {
    const data = [
      { date: '1990-01-01', event: 'Event A' },
      { date: '1995-06-15', event: 'Event B' },
      { date: '2000-11-30', event: 'Event C' },
      { date: '2005-03-20', event: 'Event D' },
      { date: '2010-09-10', event: 'Event E' },
    ];

    const margin = { top: 20, right: 30, bottom: 30, left: 40 };
    const width = 960 - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.date)))
      .range([0, width]);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale));

    const circles = svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(new Date(d.date)))
      .attr('cy', height / 2)
      .attr('r', 5)
      .attr('fill', 'steelblue')
      .attr('opacity', 0); // Start with opacity 0 for animation

    const textLabels = svg.selectAll('text.event-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'event-label')
      .attr('x', d => xScale(new Date(d.date)))
      .attr('y', height / 2 - 15)
      .attr('text-anchor', 'middle')
      .text(d => d.event)
      .attr('opacity', 0); // Start with opacity 0 for animation

    // Anime.js animation
    createTimeline({
      easing: 'easeOutExpo',
      duration: 750,
      delay: stagger(100)
    })
    .add({
      targets: circles.nodes(),
      opacity: [0, 1],
      scale: [0, 1],
    })
    .add({
      targets: textLabels.nodes(),
      opacity: [0, 1],
      translateY: [20, 0],
    }, '-=500'); // Start text animation 500ms before circles finish
  // createTimeline()

  }, []);

  return (
    <div>
      <h2>Astronomical Events Timeline</h2>
      <svg ref={svgRef}></svg>
    </div>
  );
};

export default Timeline;
