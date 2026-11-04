import { describe, expect, it } from 'vitest';
import { containsSlur } from './moderation';

describe('containsSlur', () => {
	it.each([
		'nigger',
		'Nigga',
		'N1GG3R',
		'niiiggggaaa',
		'n i g g e r',
		'n.i.g.g.a',
		'n-1-g-g-@',
		'ñíggér',
		'nіgger', // Cyrillic і
		'n​igger',
		'sandnigger',
		'my niggas',
		'faggot',
		'f@gg0t',
		'fags',
		'Fag!',
		'f a g',
		'sp1c',
		'spics',
		'k1ke',
		'chinks',
		'g00k',
		'c00n',
		'wetback',
		'towel head',
		'r@ghead',
		'tr@nny',
		'retarded',
		'r3tard',
		'Washington Redskins',
		'beaners',
		'ching chong'
	])('blocks %s', (text) => {
		expect(containsSlur(text)).toBe(true);
	});

	it.each([
		'Spicy Tacos',
		'Raccoon',
		'Negroni',
		'Niger',
		'Nigeria',
		'Flame retardant',
		'Japan',
		'Pakistan',
		'Mustard',
		'Snigger',
		'Dick Van Dyke',
		'Chef Aggie',
		'Kingdom Hearts',
		'Big Gulp',
		'Fuck Marry Kill',
		'Shit Pizza',
		'Sex on the Beach',
		'Dildo',
		'Bitch Better Have My Money',
		'Sauerkraut',
		'Cocktail',
		'Scunthorpe',
		'Homo sapiens',
		'Tyranny'
	])('allows %s', (text) => {
		expect(containsSlur(text)).toBe(false);
	});
});
