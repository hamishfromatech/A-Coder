/*--------------------------------------------------------------------------------------
 *  Copyright 2026 The A-Tech Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useState } from 'react';
import { Activity, GitBranch, Network, Target, RefreshCw, Download, ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react';

export interface MermaidDiagramProps {
	code: string;
	className?: string;
}

// Mermaid diagram type icons
const diagramTypeIcons: Record<string, React.ReactNode> = {
	flowchart: <Activity size={16} />,
	sequenceDiagram: <GitBranch size={16} />,
	classDiagram: <Network size={16} />,
	stateDiagram: <Target size={16} />,
	erDiagram: <Network size={16} />,
	gantt: <Target size={16} />,
	pie: <Network size={16} />,
	mindmap: <Network size={16} />,
	timeline: <Target size={16} />,
};

// Detect diagram type from code
function detectDiagramType(code: string): string {
	if (code.includes('flowchart') || code.includes('graph')) return 'flowchart';
	if (code.includes('sequenceDiagram')) return 'sequenceDiagram';
	if (code.includes('classDiagram')) return 'classDiagram';
	if (code.includes('stateDiagram')) return 'stateDiagram';
	if (code.includes('erDiagram')) return 'erDiagram';
	if (code.includes('gantt')) return 'gantt';
	if (code.includes('pie')) return 'pie';
	if (code.includes('mindmap')) return 'mindmap';
	if (code.includes('timeline')) return 'timeline';
	return 'flowchart'; // Default
}

// Simple SVG-based flowchart renderer (without external Mermaid.js dependency)
// This is a lightweight implementation that can be enhanced later with full Mermaid.js
const SimpleFlowchartRenderer: React.FC<{ code: string }> = ({ code }) => {
	const canvasRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!canvasRef.current) return;

		// Parse the flowchart syntax and render as SVG
		const renderFlowchart = () => {
			try {
				// Very simple parsing for basic flowchart syntax
				// Format: A --> B
				const lines = code.split('\n');
				const nodes = new Map<string, { x: number; y: number; label: string }>();
				const edges: Array<{ from: string; to: string }> = [];

				let nodeId = 0;
				const getNodePos = (id: string) => {
					if (!nodes.has(id)) {
						const row = Math.floor(nodeId / 3);
						const col = nodeId % 3;
						nodes.set(id, { x: 50 + col * 200, y: 50 + row * 100, label: id });
						nodeId++;
					}
					return nodes.get(id)!;
				};

				lines.forEach(line => {
					const match = line.match(/(\w+)\s*-->\s*(\w+)/);
					if (match) {
						const [, from, to] = match;
						getNodePos(from);
						getNodePos(to);
						edges.push({ from, to });
					}
				});

				// Render SVG
				let svg = `<svg width="100%" height="100%" viewBox="0 0 ${Math.max(nodes.size * 150, 400)} ${Math.max(Math.ceil(nodes.size / 3) * 120, 200)}" xmlns="http://www.w3.org/2000/svg">`;
				svg += `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#9333ea" /></marker></defs>`;

				// Render edges
				edges.forEach(edge => {
					const fromNode = nodes.get(edge.from);
					const toNode = nodes.get(edge.to);
					if (fromNode && toNode) {
						svg += `<line x1="${fromNode.x + 60}" y1="${fromNode.y + 20}" x2="${toNode.x}" y2="${toNode.y + 20}" stroke="#9333ea" stroke-width="2" marker-end="url(#arrowhead)" />`;
					}
				});

				// Render nodes
				nodes.forEach(node => {
					svg += `<rect x="${node.x}" y="${node.y}" width="120" height="40" rx="8" fill="#1e1e2e" stroke="#9333ea" stroke-width="2"/>`;
					svg += `<text x="${node.x + 60}" y="${node.y + 25}" text-anchor="middle" fill="#e5e5e5" font-size="14" font-family="sans-serif">${node.label}</text>`;
				});

				svg += '</svg>';
				canvasRef.current.innerHTML = svg;
			} catch (error) {
				canvasRef.current.innerHTML = '<p class="text-red-500">Error rendering diagram</p>';
			}
		};

		renderFlowchart();
	}, [code]);

	return <div ref={canvasRef} className="w-full h-full" />;
};

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, className = '' }) => {
	const [zoom, setZoom] = useState(100);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [diagramType, setDiagramType] = useState(() => detectDiagramType(code));
	const [copied, setCopied] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleZoomIn = () => setZoom(prev => Math.min(200, prev + 25));
	const handleZoomOut = () => setZoom(prev => Math.max(50, prev - 25));
	const handleResetZoom = () => setZoom(100);

	const handleCopy = () => {
		navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleDownloadSVG = () => {
		const svg = containerRef.current?.querySelector('svg');
		if (svg) {
			const svgData = new XMLSerializer().serializeToString(svg);
			const blob = new Blob([svgData], { type: 'image/svg+xml' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `diagram-${diagramType}.svg`;
			a.click();
			URL.revokeObjectURL(url);
		}
	};

	const diagramIcon = diagramTypeIcons[diagramType] || diagramTypeIcons.flowchart;

	return (
		<div className={`relative ${className}`}>
			{/* Header toolbar */}
			<div className="flex items-center justify-between px-3 py-2 bg-void-bg-2 border border-void-border-2 rounded-t-lg">
				<div className="flex items-center gap-2">
					<span className="text-purple-400">{diagramIcon}</span>
					<span className="text-sm font-medium text-void-fg-1 capitalize">{diagramType.replace(/([A-Z])/g, ' $1').trim()}</span>
					<span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">Mermaid</span>
				</div>
				<div className="flex items-center gap-1">
					{/* Zoom controls */}
					<div className="flex items-center gap-1 mr-2">
						<button
							onClick={handleZoomOut}
							className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
							title="Zoom out"
						>
							<ZoomOut size={14} className="text-void-fg-3" />
						</button>
						<span className="text-xs text-void-fg-3 w-12 text-center">{zoom}%</span>
						<button
							onClick={handleZoomIn}
							className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
							title="Zoom in"
						>
							<ZoomIn size={14} className="text-void-fg-3" />
						</button>
						<button
							onClick={handleResetZoom}
							className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
							title="Reset zoom"
						>
							<RefreshCw size={14} className="text-void-fg-3" />
						</button>
					</div>

					{/* Action buttons */}
					<button
						onClick={handleCopy}
						className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
						title="Copy code"
					>
						{copied ? (
							<Activity size={14} className="text-green-500" />
						) : (
							<Download size={14} className="text-void-fg-3" />
						)}
					</button>
					<button
						onClick={handleDownloadSVG}
						className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
						title="Download as SVG"
					>
						<Download size={14} className="text-void-fg-3" />
					</button>
					<button
						onClick={() => setIsFullscreen(!isFullscreen)}
						className="p-1.5 hover:bg-void-bg-3 rounded-lg transition-colors"
						title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
					>
						{isFullscreen ? <Minimize2 size={14} className="text-void-fg-3" /> : <Maximize2 size={14} className="text-void-fg-3" />}
					</button>
				</div>
			</div>

			{/* Diagram container */}
			<div
				ref={containerRef}
				className={`
					overflow-auto bg-gradient-to-br from-void-bg-4 to-void-bg-3 border-l border-r border-b border-void-border-2
					${isFullscreen ? 'fixed inset-4 z-50 rounded-xl shadow-2xl' : 'rounded-b-lg max-h-96'}
					transition-all duration-200
				`}
				style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
			>
				<div className="min-h-full p-4 flex items-center justify-center">
					<SimpleFlowchartRenderer code={code} />
				</div>
			</div>

			{/* Source code toggle */}
			<details className="mt-0">
				<summary className="px-3 py-2 text-xs text-void-fg-3 hover:text-void-fg-1 cursor-pointer select-none">
					Show Mermaid source
				</summary>
				<pre className="px-3 py-2 text-xs bg-void-bg-2 text-void-fg-3 font-mono overflow-x-auto border-t border-void-border-2">
					{code}
				</pre>
			</details>
		</div>
	);
};

export default MermaidDiagram;