import type { ItemSeed } from './types';

/**
 * Pineapple sits in `bad` on purpose. Tiers are hidden, so this only affects how
 * often it gets dealt — and the point of the card is the argument it starts, which
 * is exactly what a famous-and-divisive pick is for.
 */
export const PIZZA_TOPPINGS: ItemSeed[] = [
	// great
	{ name: 'Pepperoni', tier: 'great' },
	{ name: 'Extra cheese', tier: 'great' },
	{ name: 'Bacon', tier: 'great' },
	{ name: 'Sausage', tier: 'great' },
	{ name: 'Hot honey', tier: 'great' },
	{ name: 'Fresh mozzarella', tier: 'great' },
	{ name: 'Buffalo chicken', tier: 'great' },
	{ name: 'BBQ chicken', tier: 'great' },
	{ name: 'Meatballs', tier: 'great' },
	{ name: 'Garlic', tier: 'great' },
	{ name: 'Basil', tier: 'great' },

	// good
	{ name: 'Mushrooms', tier: 'good' },
	{ name: 'Red onion', tier: 'good' },
	{ name: 'Jalapenos', tier: 'good' },
	{ name: 'Ham', tier: 'good' },
	{ name: 'Pesto', tier: 'good' },
	{ name: 'Prosciutto', tier: 'good' },
	{ name: 'Banana peppers', tier: 'good' },
	{ name: 'Parmesan', tier: 'good' },
	{ name: 'Salami', tier: 'good' },
	{ name: 'Ricotta', tier: 'good' },

	// mid
	{ name: 'Green pepper', tier: 'mid' },
	{ name: 'Black olives', tier: 'mid' },
	{ name: 'Spinach', tier: 'mid' },
	{ name: 'Tomato slices', tier: 'mid' },
	{ name: 'Grilled chicken', tier: 'mid' },
	{ name: 'Feta', tier: 'mid' },
	{ name: 'Arugula', tier: 'mid' },
	{ name: 'Artichoke hearts', tier: 'mid' },
	{ name: 'Ranch drizzle', tier: 'mid' },
	{ name: 'Red pepper flakes', tier: 'mid' },
	{ name: 'Cherry tomatoes', tier: 'mid' },
	{ name: 'Roasted garlic', tier: 'mid' },
	{ name: 'Provolone', tier: 'mid' },
	{ name: 'Sun-dried tomatoes', tier: 'mid' },
	{ name: 'Sweet corn', tier: 'mid' },
	{ name: 'Fried egg', tier: 'mid' },
	{ name: 'Chorizo', tier: 'mid' },
	{ name: 'Caramelized onions', tier: 'mid' },

	// bad
	{ name: 'Pineapple', tier: 'bad' },
	{ name: 'Anchovies', tier: 'bad' },
	{ name: 'Broccoli', tier: 'bad' },
	{ name: 'Eggplant', tier: 'bad' },
	{ name: 'Zucchini', tier: 'bad' },
	{ name: 'Green olives', tier: 'bad' },
	{ name: 'Blue cheese', tier: 'bad' },
	{ name: 'Canned mushrooms', tier: 'bad' },
	{ name: 'Sardines', tier: 'bad' }
];
