'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';

function PresentationViewer({ slides, title = 'Signatura Issuers' }) {
	const [index, setIndex] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const shellRef = useRef(null);
	const total = slides.length;
	const currentSlide = slides[index];

	const canGoPrevious = index > 0;
	const canGoNext = index < total - 1;

	const counterLabel = useMemo(() => `${index + 1} / ${total}`, [index, total]);

	useEffect(() => {
		function handleKeyDown(event) {
			if (event.key === 'ArrowRight') {
				setIndex((current) => Math.min(total - 1, current + 1));
			}
			if (event.key === 'ArrowLeft') {
				setIndex((current) => Math.max(0, current - 1));
			}
			if (event.key === 'Escape' && document.fullscreenElement) {
				document.exitFullscreen();
			}
		}

		function handleFullscreenChange() {
			setIsFullscreen(Boolean(document.fullscreenElement));
		}

		window.addEventListener('keydown', handleKeyDown);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		};
	}, [total]);

	async function toggleFullscreen() {
		if (!document.fullscreenElement) {
			await shellRef.current?.requestFullscreen?.();
			return;
		}
		await document.exitFullscreen();
	}

	return (
		<div
			ref={shellRef}
			className="flex min-h-screen flex-col bg-[#030A23] text-white"
			onContextMenu={(event) => event.preventDefault()}>
			<header className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div className="flex items-center gap-3">
					<Image
						src="/signatura-logo.png"
						alt="Signatura logo"
						width={36}
						height={42}
						className="h-9 w-auto object-contain"
						priority
					/>
					<div>
						<p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E31E3B]">
							Signatura
						</p>
						<h1 className="text-base font-semibold text-white sm:text-lg">
							{title}
						</h1>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<span className="rounded-full border border-white/15 px-3 py-1 text-sm font-semibold text-slate-200">
						{counterLabel}
					</span>
					<button
						type="button"
						onClick={toggleFullscreen}
						className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-white transition hover:border-[#E31E3B] hover:text-red-100">
						{isFullscreen ? (
							<Minimize2 className="h-4 w-4" aria-hidden="true" />
						) : (
							<Maximize2 className="h-4 w-4" aria-hidden="true" />
						)}
						<span>{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
					</button>
				</div>
			</header>

			<main className="flex flex-1 flex-col items-center justify-center gap-5 px-3 py-5 sm:px-6">
				<div className="grid w-full max-w-6xl place-items-center">
					<div className="aspect-4/3 w-full overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl shadow-black/40">
						<Image
							src={currentSlide.src}
							alt={currentSlide.alt}
							width={1600}
							height={1200}
							priority={index === 0}
							draggable="false"
							onContextMenu={(event) => event.preventDefault()}
							className="h-full w-full select-none object-contain"
						/>
					</div>
				</div>

				<nav className="flex w-full max-w-6xl items-center justify-between gap-3">
					<button
						type="button"
						onClick={() => setIndex((current) => Math.max(0, current - 1))}
						disabled={!canGoPrevious}
						className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-[#E31E3B] disabled:cursor-not-allowed disabled:opacity-35">
						<ChevronLeft className="h-4 w-4" aria-hidden="true" />
						<span>Previous</span>
					</button>
					<div className="h-px flex-1 bg-white/10" />
					<button
						type="button"
						onClick={() => setIndex((current) => Math.min(total - 1, current + 1))}
						disabled={!canGoNext}
						className="inline-flex items-center gap-2 rounded-lg bg-[#E31E3B] px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700">
						<span>Next</span>
						<ChevronRight className="h-4 w-4" aria-hidden="true" />
					</button>
				</nav>
			</main>
		</div>
	);
}

export { PresentationViewer };
