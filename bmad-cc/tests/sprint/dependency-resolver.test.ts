import { describe, it, expect } from 'vitest';
import { resolveDependencyOrder } from '../../src/sprint/dependency-resolver.js';
import { SprintStatus } from '../../src/sprint/sprint-status-parser.js';
import { Epic } from '../../src/sprint/epic-parser.js';

describe('Dependency Resolver', () => {
  const mockStatus: SprintStatus = {
    meta: {},
    actionItems: [],
    developmentStatus: {
      'epic-0': 'done',
      '0-1-cleanup': 'done',
      '0-2-more-cleanup': 'done',
      'epic-1': 'in-progress',
      '1-1-story': 'done',
      '1-2-story': 'in-progress',
      '1-3-story': 'backlog',
      'epic-2': 'backlog',
      '2-1-story': 'backlog',
      '2-2-story': 'backlog',
    }
  };

  const mockEpics: Epic[] = [
    { key: 'epic-0', title: 'Zero', storyKeys: ['0-1-cleanup', '0-2-more-cleanup'], dependencies: [] },
    { key: 'epic-1', title: 'One', storyKeys: ['1-1-story', '1-2-story', '1-3-story'], dependencies: ['epic-0'] },
    { key: 'epic-2', title: 'Two', storyKeys: ['2-1-story', '2-2-story'], dependencies: [] },
  ];

  it('should resolve order for simple linear epics', () => {
    const queue = resolveDependencyOrder(mockStatus, mockEpics);
    
    // Check total queue length (7 stories)
    expect(queue).toHaveLength(7);
    
    // Check order
    expect(queue[0].storyKey).toBe('0-1-cleanup');
    expect(queue[1].storyKey).toBe('0-2-more-cleanup');
    expect(queue[2].storyKey).toBe('1-1-story');
    expect(queue[3].storyKey).toBe('1-2-story');
    expect(queue[4].storyKey).toBe('1-3-story');
    expect(queue[5].storyKey).toBe('2-1-story');
    expect(queue[6].storyKey).toBe('2-2-story');
    
    // Check priorities
    expect(queue[0].priority).toBe(1);
    expect(queue[6].priority).toBe(7);
  });

  it('should respect numeric sorting of stories despite key alphabetical order', () => {
    const statusWithWeirdOrder: SprintStatus = {
      meta: {},
      actionItems: [],
      developmentStatus: {
        'epic-1': 'in-progress',
        '1-10-story': 'backlog',
        '1-2-story': 'backlog',
        '1-1-story': 'backlog',
      }
    };
    
    const epics = [{ key: 'epic-1', title: 'One', storyKeys: [], dependencies: [] }];
    const queue = resolveDependencyOrder(statusWithWeirdOrder, epics);
    
    expect(queue).toHaveLength(3);
    expect(queue[0].storyKey).toBe('1-1-story');
    expect(queue[1].storyKey).toBe('1-2-story');
    expect(queue[2].storyKey).toBe('1-10-story');
  });
});
