const taskService = require('../src/services/taskService');

beforeEach(() => taskService._reset());

describe('taskService.create', () => {
  test('creates a task with defaults', () => {
    const t = taskService.create({ title: 'A' });
    expect(t.id).toBeDefined();
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('medium');
    expect(t.completedAt).toBeNull();
    expect(t.createdAt).toBeDefined();
  });
});

describe('taskService.getPaginated', () => {
  test('page 1 returns first batch', () => {
    for (let i = 1; i <= 15; i++) taskService.create({ title: `T${i}` });
    const page1 = taskService.getPaginated(1, 10);
    expect(page1).toHaveLength(10);
    expect(page1[0].title).toBe('T1');   // ← would have failed before your fix
  });

  test('page 2 returns the rest', () => {
    for (let i = 1; i <= 15; i++) taskService.create({ title: `T${i}` });
    const page2 = taskService.getPaginated(2, 10);
    expect(page2).toHaveLength(5);
    expect(page2[0].title).toBe('T11');
  });
});

describe('taskService.getByStatus', () => {
  test('returns only exact matches', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'done' });
    const r = taskService.getByStatus('do');
    expect(r).toHaveLength(0);   // ← would have failed before your fix
  });
});

describe('taskService.completeTask', () => {
  test('preserves priority', () => {
    const t = taskService.create({ title: 'A', priority: 'high' });
    const c = taskService.completeTask(t.id);
    expect(c.status).toBe('done');
    expect(c.priority).toBe('high');   // ← would have failed before your fix
    expect(c.completedAt).not.toBeNull();
  });

  test('returns null for unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });
});

describe('taskService.update', () => {
  test('merges fields', () => {
    const t = taskService.create({ title: 'A', priority: 'high' });
    const u = taskService.update(t.id, { title: 'B' });
    expect(u.title).toBe('B');
    expect(u.priority).toBe('high');
  });

  test('returns null for unknown id', () => {
    expect(taskService.update('nope', { title: 'X' })).toBeNull();
  });

  // This test documents Bug #7 — expected to fail today
  test('cannot overwrite id or createdAt', () => {
    const t = taskService.create({ title: 'A' });
    const u = taskService.update(t.id, { id: 'hacked', createdAt: '1970-01-01' });
    expect(u.id).toBe(t.id);
    expect(u.createdAt).toBe(t.createdAt);
  });
});

describe('taskService.getStats', () => {
  test('counts by status', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'in_progress' });
    taskService.create({ title: 'C', status: 'done' });
    const s = taskService.getStats();
    expect(s).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 0 });
  });

  test('overdue only counts non-done tasks with past dueDate', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    taskService.create({ title: 'A', dueDate: past, status: 'todo' });
    taskService.create({ title: 'B', dueDate: past, status: 'done' });
    const s = taskService.getStats();
    expect(s.overdue).toBe(1);
  });
});

describe('taskService.remove', () => {
  test('removes and returns true', () => {
    const t = taskService.create({ title: 'A' });
    expect(taskService.remove(t.id)).toBe(true);
    expect(taskService.findById(t.id)).toBeUndefined();
  });
  test('returns false for unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('taskService.getAll', () => {
  test('returns a copy, not the internal array', () => {
    taskService.create({ title: 'A' });
    const all = taskService.getAll();
    all.push({ fake: true });
    expect(taskService.getAll()).toHaveLength(1);
  });
});