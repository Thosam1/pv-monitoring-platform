/**
 * Unit tests for narrative-preferences.ts
 *
 * Tests narrative preference types, defaults, and verbosity matching.
 */
import {
  DEFAULT_NARRATIVE_PREFERENCES,
  VERBOSITY_WORD_TARGETS,
  matchesVerbosity,
  NarrativeVerbosity,
} from './narrative-preferences';

describe('DEFAULT_NARRATIVE_PREFERENCES', () => {
  it('should have casual tone by default', () => {
    expect(DEFAULT_NARRATIVE_PREFERENCES.tone).toBe('casual');
  });

  it('should have standard verbosity by default', () => {
    expect(DEFAULT_NARRATIVE_PREFERENCES.verbosity).toBe('standard');
  });

  it('should have advisor persona by default', () => {
    expect(DEFAULT_NARRATIVE_PREFERENCES.persona).toBe('advisor');
  });

  it('should have all required properties', () => {
    expect(DEFAULT_NARRATIVE_PREFERENCES).toHaveProperty('tone');
    expect(DEFAULT_NARRATIVE_PREFERENCES).toHaveProperty('verbosity');
    expect(DEFAULT_NARRATIVE_PREFERENCES).toHaveProperty('persona');
  });
});

describe('VERBOSITY_WORD_TARGETS', () => {
  it('should have targets for brief verbosity', () => {
    expect(VERBOSITY_WORD_TARGETS.brief).toBeDefined();
    expect(VERBOSITY_WORD_TARGETS.brief.min).toBe(15);
    expect(VERBOSITY_WORD_TARGETS.brief.max).toBe(40);
  });

  it('should have targets for standard verbosity', () => {
    expect(VERBOSITY_WORD_TARGETS.standard).toBeDefined();
    expect(VERBOSITY_WORD_TARGETS.standard.min).toBe(30);
    expect(VERBOSITY_WORD_TARGETS.standard.max).toBe(70);
  });

  it('should have targets for detailed verbosity', () => {
    expect(VERBOSITY_WORD_TARGETS.detailed).toBeDefined();
    expect(VERBOSITY_WORD_TARGETS.detailed.min).toBe(60);
    expect(VERBOSITY_WORD_TARGETS.detailed.max).toBe(120);
  });

  it('should have min less than max for all verbosity levels', () => {
    const verbosities: NarrativeVerbosity[] = ['brief', 'standard', 'detailed'];
    verbosities.forEach((v) => {
      expect(VERBOSITY_WORD_TARGETS[v].min).toBeLessThan(
        VERBOSITY_WORD_TARGETS[v].max,
      );
    });
  });

  it('should have increasing ranges for increasing verbosity', () => {
    expect(VERBOSITY_WORD_TARGETS.brief.max).toBeLessThan(
      VERBOSITY_WORD_TARGETS.standard.min + 20,
    );
    expect(VERBOSITY_WORD_TARGETS.standard.max).toBeLessThan(
      VERBOSITY_WORD_TARGETS.detailed.min + 20,
    );
  });
});

describe('matchesVerbosity', () => {
  describe('brief verbosity (15-40 words)', () => {
    it('should return true for 15 words (min)', () => {
      const narrative =
        'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
      expect(matchesVerbosity(narrative, 'brief')).toBe(true);
    });

    it('should return true for 25 words (within range)', () => {
      const words = Array(25).fill('word').join(' ');
      expect(matchesVerbosity(words, 'brief')).toBe(true);
    });

    it('should return true for 40 words (max)', () => {
      const words = Array(40).fill('word').join(' ');
      expect(matchesVerbosity(words, 'brief')).toBe(true);
    });

    it('should return false for 10 words (below min)', () => {
      const words = Array(10).fill('word').join(' ');
      expect(matchesVerbosity(words, 'brief')).toBe(false);
    });

    it('should return false for 50 words (above max)', () => {
      const words = Array(50).fill('word').join(' ');
      expect(matchesVerbosity(words, 'brief')).toBe(false);
    });
  });

  describe('standard verbosity (30-70 words)', () => {
    it('should return true for 30 words (min)', () => {
      const words = Array(30).fill('word').join(' ');
      expect(matchesVerbosity(words, 'standard')).toBe(true);
    });

    it('should return true for 50 words (within range)', () => {
      const words = Array(50).fill('word').join(' ');
      expect(matchesVerbosity(words, 'standard')).toBe(true);
    });

    it('should return true for 70 words (max)', () => {
      const words = Array(70).fill('word').join(' ');
      expect(matchesVerbosity(words, 'standard')).toBe(true);
    });

    it('should return false for 20 words (below min)', () => {
      const words = Array(20).fill('word').join(' ');
      expect(matchesVerbosity(words, 'standard')).toBe(false);
    });

    it('should return false for 80 words (above max)', () => {
      const words = Array(80).fill('word').join(' ');
      expect(matchesVerbosity(words, 'standard')).toBe(false);
    });
  });

  describe('detailed verbosity (60-120 words)', () => {
    it('should return true for 60 words (min)', () => {
      const words = Array(60).fill('word').join(' ');
      expect(matchesVerbosity(words, 'detailed')).toBe(true);
    });

    it('should return true for 90 words (within range)', () => {
      const words = Array(90).fill('word').join(' ');
      expect(matchesVerbosity(words, 'detailed')).toBe(true);
    });

    it('should return true for 120 words (max)', () => {
      const words = Array(120).fill('word').join(' ');
      expect(matchesVerbosity(words, 'detailed')).toBe(true);
    });

    it('should return false for 50 words (below min)', () => {
      const words = Array(50).fill('word').join(' ');
      expect(matchesVerbosity(words, 'detailed')).toBe(false);
    });

    it('should return false for 150 words (above max)', () => {
      const words = Array(150).fill('word').join(' ');
      expect(matchesVerbosity(words, 'detailed')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(matchesVerbosity('', 'brief')).toBe(false);
      expect(matchesVerbosity('', 'standard')).toBe(false);
      expect(matchesVerbosity('', 'detailed')).toBe(false);
    });

    it('should handle single word', () => {
      expect(matchesVerbosity('hello', 'brief')).toBe(false);
    });

    it('should handle multiple spaces between words', () => {
      const narrative = 'one  two   three    four     five';
      // This splits on /\s+/ so should count as 5 words, but also empty strings
      // Actually split(/\s+/) on 'one  two' gives ['one', 'two']
      expect(matchesVerbosity(narrative, 'brief')).toBe(false); // Only 5 words
    });

    it('should count words with punctuation', () => {
      const narrative =
        'Hello, world! This is a test. How are you doing today?';
      // 10 words including punctuation attached to words
      expect(matchesVerbosity(narrative, 'brief')).toBe(false); // 10 words < 15
    });

    it('should handle newlines as word separators', () => {
      const words = Array(20).fill('word').join('\n');
      expect(matchesVerbosity(words, 'brief')).toBe(true); // 20 words in range
    });

    it('should handle tabs as word separators', () => {
      const words = Array(20).fill('word').join('\t');
      expect(matchesVerbosity(words, 'brief')).toBe(true); // 20 words in range
    });
  });
});
