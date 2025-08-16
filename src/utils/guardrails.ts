export interface ValidationResult {
	isValid: boolean;
	category: string | null;
	confidence: number;
	qualityScore: number; // Retain for now, will be derived from text confidence
	reasons: string[];
}

export class CelestialImageValidator {
	private readonly astronomicalCategories = {
		// Deep Space Objects
		deepSpace: [
			"Galaxy", "Galaxies", "Spiral Galaxy", "Elliptical Galaxy", "Dwarf Galaxy",
			"Galaxy Cluster", "Galaxy Group", "Andromeda", "Milky Way",
			"Nebula", "Emission Nebula", "Reflection Nebula", "Dark Nebula",
			"Planetary Nebula", "Supernova Remnant", "H II Region",
			"Star Cluster", "Open Cluster", "Globular Cluster", "Star Formation",
			"Molecular Cloud", "Dust Cloud"
		],
		
		// Stellar Objects
		stellar: [
			"Star", "Stars", "Binary Star", "Variable Star", "Giant Star",
			"White Dwarf", "Red Giant", "Blue Giant", "Main Sequence",
			"Supernova", "Hypernova", "Nova", "Stellar Explosion",
			"Pulsar", "Neutron Star", "Magnetar",
			"Black Hole", "Event Horizon", "Accretion Disk"
		],
		
		// Solar System
		solarSystem: [
			"Planet", "Planets", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
			"Uranus", "Neptune", "Exoplanet", "Extrasolar Planet",
			"Moon", "Moons", "Satellite", "Europa", "Titan", "Io", "Ganymede",
			"Asteroid", "Asteroid Belt", "Comet", "Meteor", "Meteorite",
			"Solar Wind", "Magnetosphere", "Van Allen Belt"
		],
		
		// Solar Phenomena
		solar: [
			"Sun", "Solar", "Corona", "Solar Flare", "Coronal Mass Ejection",
			"Sunspot", "Solar Eclipse", "Transit", "Solar Prominence",
			"Chromosphere", "Photosphere"
		],
		
		// Earth-based Astronomical Phenomena
		earthBased: [
			"Lunar Eclipse", "Eclipse", "Aurora", "Aurora Borealis", "Aurora Australis",
			"Northern Lights", "Southern Lights", "Airglow",
			"Constellation", "Star Trail", "Star Trails", "Zodiacal Light",
			"Gegenschein", "Milky Way Arc"
		],
		
		// Exotic Objects
		exotic: [
			"Quasar", "Active Galactic Nucleus", "AGN", "Blazer", "Seyfert Galaxy",
			"Gamma Ray Burst", "GRB", "Fast Radio Burst", "FRB",
			"Gravitational Wave", "Gravitational Lensing", "Dark Matter",
			"Dark Energy", "Cosmic Web", "Void"
		],
		
		// Observational/Technical
		observational: [
			"Telescope", "Observatory", "Radio Telescope", "Space Telescope",
			"Hubble", "James Webb", "Spitzer", "Chandra", "Kepler", "TESS",
			"Spectrum", "Spectroscopy", "Photometry", "Astrometry"
		]
	};

	private readonly excludedTerms = [
		// Earth-centric non-astronomical
		"Earth", "Landscape", "Mountain", "Ocean", "Weather", "Cloud",
		"Building", "City", "Person", "People", "Portrait", "Animal",
		"Plant", "Tree", "Flower", "Food", "Vehicle", "Aircraft",
		
		// General non-specific terms
		"Abstract", "Artwork", "Painting", "Drawing", "Illustration",
		"Computer Generated", "Simulation", "Model", "Diagram", "Chart",
		
		// Low quality indicators (now only relevant for text descriptions)
		"Blurry", "Out of Focus", "Overexposed", "Underexposed", 
		"Noise", "Artifact", "Compression", "Pixelated"
	];

	/**
	 * Validates if the content is celestial based on text.
	 * Image quality metrics are ignored for now.
	 */
	public validateCelestialImage(
		title: string, 
		description: string
	): ValidationResult {
		const categoryResult = this.validateCategory(title, description);
		
		// For now, overall score and quality score are directly from category validation
		const overallScore = categoryResult.confidence;
		const reasons = [...categoryResult.reasons];
		
		return {
			isValid: categoryResult.isValid,
			category: categoryResult.category,
			confidence: overallScore,
			qualityScore: overallScore, // Quality score is now same as confidence for text-only
			reasons
		};
	}

	/**
	 * Validates if the image belongs to astronomical categories
	 */
	private validateCategory(title: string, description: string): {
		isValid: boolean;
		category: string | null;
		confidence: number;
		reasons: string[];
	} {
		const combinedText = `${title} ${description}`.toLowerCase();
		const reasons: string[] = [];
		
		// Check for excluded terms first
		const hasExcludedTerms = this.excludedTerms.some(term => 
			combinedText.includes(term.toLowerCase())
		);
		
		if (hasExcludedTerms) {
			reasons.push("Contains non-astronomical content indicators");
			return { isValid: false, category: null, confidence: 0, reasons };
		}
		
		// Find matching categories with confidence scoring
		const matches: { category: string; type: string; count: number }[] = [];
		
		Object.entries(this.astronomicalCategories).forEach(([type, categories]) => {
			categories.forEach(category => {
				const regex = new RegExp(`\\b${category.toLowerCase()}\\b`, 'gi');
				const matchCount = (combinedText.match(regex) || []).length;
				
				if (matchCount > 0) {
					matches.push({ category, type, count: matchCount });
				}
			});
		});
		
		if (matches.length === 0) {
			reasons.push("No astronomical keywords found");
			return { isValid: false, category: null, confidence: 0, reasons };
		}
		
		// Calculate confidence based on matches
		const bestMatch = matches.reduce((best, current) => 
			current.count > best.count ? current : best
		);
		
		const confidence = Math.min(
			0.5 + (matches.length * 0.1) + (bestMatch.count * 0.2), 
			1.0
		);
		
		reasons.push(`Found ${matches.length} astronomical term(s)`);
		reasons.push(`Primary category: ${bestMatch.category} (${bestMatch.type})`);
		
		return {
			isValid: confidence >= 0.6,
			category: bestMatch.category,
			confidence,
			reasons
		};
	}

	/**
	 * Batch validation for multiple images (now text-only)
	 */
	public validateImageBatch(
		images: Array<{
			title: string;
			description: string;
		}>
	): ValidationResult[] {
		return images.map(image => 
			this.validateCelestialImage(image.title, image.description)
		);
	}

	/**
	 * Get filtered high-quality celestial images (now text-only validation)
	 */
	public getHighQualityImages<T extends { title: string; description: string }>(
		images: T[],
		minConfidence: number = 0.7
	): Array<T & { validationResult: ValidationResult }> {
		return images
			.map(image => ({
				...image,
				validationResult: this.validateCelestialImage(image.title, image.description)
			}))
			.filter(item => 
				item.validationResult.isValid && 
				item.validationResult.confidence >= minConfidence
			);
	}
}