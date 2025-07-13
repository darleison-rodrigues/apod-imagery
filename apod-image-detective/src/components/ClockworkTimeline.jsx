import { createAnimatable, utils } from 'animejs';
import { useEffect, useRef, useState } from 'react';
import './ClockworkTimeline.css';
import mockApodData from '../mockApodData';

const PI = Math.PI;

function ClockworkTimeline() {
  const clock1Ref = useRef(null);
  const clock2Ref = useRef(null);
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState(null);
  const scrollTimeoutRef = useRef(null);
  const clock1Animatable = useRef(null);
  const clock2Animatable = useRef(null);

  useEffect(() => {
    if (!clock1Animatable.current) {
      clock1Animatable.current = createAnimatable(clock1Ref.current, {
        rotate: { unit: 'rad' },
        modifier: utils.snap(PI / 10),
        duration: 750, // Set animation duration
      });
    }
    if (!clock2Animatable.current) {
      clock2Animatable.current = createAnimatable(clock2Ref.current, {
        rotate: { unit: 'rad' },
        modifier: v => -v,
        duration: 750, // Set animation duration
      });
    }

    const handleWheel = (e) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      setCurrentDateIndex(prevIndex => {
        let newIndex = prevIndex + direction;
        if (newIndex < 0) {
          newIndex = mockApodData.length - 1;
        } else if (newIndex >= mockApodData.length) {
          newIndex = 0;
        }
        return newIndex;
      });
    };

    const clockContainer = clock1Ref.current;
    if (clockContainer) {
      clockContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Initial load of data and tooltip
    const apodEntry = mockApodData[currentDateIndex];
    if (apodEntry) {
      setTooltipContent(apodEntry);
      setShowTooltip(true);
    }

    return () => {
      if (clockContainer) {
        clockContainer.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  useEffect(() => {
    const totalEntries = mockApodData.length;
    const anglePerEntry = (2 * PI) / totalEntries;
    const targetAngle = currentDateIndex * anglePerEntry;

    const clock1 = clock1Animatable.current;
    const clock2 = clock2Animatable.current;

    if (clock1 && clock2) {
      clock1.rotate(targetAngle, true);
      clock2.rotate(-targetAngle, true);
    }

    const animationDuration = 750; // milliseconds, matches animatable duration

    // Hide tooltip immediately when index changes
    setShowTooltip(false);

    // Clear any existing tooltip timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Show tooltip after animation completes
    scrollTimeoutRef.current = setTimeout(() => {
      const apodEntry = mockApodData[currentDateIndex];
      if (apodEntry) {
        setTooltipContent(apodEntry);
        setShowTooltip(true);

        // Calculate tooltip position
        const clockContainer = clock1Ref.current;
        if (clockContainer) {
          const { width, height } = clockContainer.getBoundingClientRect();
          const centerX = width / 2;
          const centerY = height / 2;
          const radius = width / 2; // Assuming clock is a circle

          // Angle is measured from the positive x-axis, counter-clockwise
          // Clock hand points upwards (negative y-axis) at 0 index
          // So, we need to adjust the angle by -PI/2 to align with standard polar coordinates
          const adjustedAngle = targetAngle - PI / 2;

          const tooltipDistance = radius + 2; // Distance from center to tooltip (adjust as needed)

          const tooltipX = centerX + tooltipDistance * Math.cos(adjustedAngle);
          const tooltipY = centerY + tooltipDistance * Math.sin(adjustedAngle);

          setTooltipPosition({ left: `${tooltipX}px`, top: `${tooltipY}px` });
        }
      }
    }, animationDuration);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentDateIndex]);

  const [tooltipPosition, setTooltipPosition] = useState({ });

  return (
    <div className="clock-timeline-container">
      <div className="clock-container" ref={clock1Ref}>
        <div className="clock-1"></div>
        <div ref={clock2Ref} className="clock-2"></div>
      </div>
      {showTooltip && tooltipContent && (
        <div className="apod-tooltip" style={tooltipPosition}>
          <h3>{tooltipContent.date}</h3>
          <h4>{tooltipContent.title}</h4>
          {tooltipContent.media_type === 'image' && (
            <img src={tooltipContent.url} alt={tooltipContent.title} style={{ maxWidth: '100%', height: 'auto' }} />
          )}
          <p>{tooltipContent.explanation}</p>
        </div>
      )}
    </div>
  );
}

export default ClockworkTimeline;