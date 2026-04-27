import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Props {
  confidence: number;
}

export const D3ResultChart: React.FC<Props> = ({ confidence }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 200;
    const height = 200;
    const innerRadius = 70;
    const outerRadius = 90;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .html('');

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const arc = d3.arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .startAngle(0);

    // Background circle
    g.append('path')
      .datum({ endAngle: 2 * Math.PI })
      .style('fill', '#1c212b')
      .attr('d', arc);

    // Active arc
    const foreground = g.append('path')
      .datum({ endAngle: 0 })
      .style('fill', '#00f2fe')
      .attr('d', arc);

    foreground.transition()
      .duration(1500)
      .attrTween('d', (d: any) => {
        const interpolate = d3.interpolate(0, (confidence / 100) * 2 * Math.PI);
        return (t: number) => {
          d.endAngle = interpolate(t);
          return arc(d);
        };
      });

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('fill', '#e2e8f0')
      .attr('class', 'text-4xl font-bold font-mono tracking-tighter')
      .text(`${confidence}%`);

  }, [confidence]);

  return <svg ref={svgRef} className="mx-auto" />;
};
