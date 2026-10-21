import { describe, expect, it } from 'vitest';
import { projectWebsiteUrl } from './project-website';

describe('project website link', () => {
  it('opens the Disco repository and never an upstream MangoDisk domain', () => {
    expect(projectWebsiteUrl()).toBe('https://github.com/nikporras/Disco');
    expect(projectWebsiteUrl()).not.toContain('mangodisk.app');
  });
});
