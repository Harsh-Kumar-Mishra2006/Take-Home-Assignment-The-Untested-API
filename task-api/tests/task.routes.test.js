const request = require('supertest');
const app = require('../src/app');          
const taskService = require('../src/services/taskService');

beforeEach(() => taskService._reset());

describe('POST /tasks', () => {
  test('201 with valid body', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
  test('400 without title', async () => {
    const res = await request(app).post('/tasks').send({});
    expect(res.status).toBe(400);
  });
  test('400 with invalid priority', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A', priority: 'urgent' });
    expect(res.status).toBe(400);
  });
});

describe('GET /tasks', () => {
  test('returns [] when empty', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('paginates from page 1 correctly', async () => {
    for (let i = 1; i <= 15; i++) {
      await request(app).post('/tasks').send({ title: `T${i}` });
    }
    const res = await request(app).get('/tasks?page=1&limit=10');
    expect(res.body).toHaveLength(10);
    expect(res.body[0].title).toBe('T1');
  });

  test('400 on non-numeric page', async () => {
    const res = await request(app).get('/tasks?page=abc');
    expect(res.status).toBe(400);
  });

  test('400 on page=0', async () => {
    const res = await request(app).get('/tasks?page=0');
    expect(res.status).toBe(400);
  });

  test('status + page combines', async () => {
    for (let i = 1; i <= 12; i++) {
      await request(app).post('/tasks').send({ title: `T${i}`, status: 'todo' });
    }
    const res = await request(app).get('/tasks?status=todo&page=1&limit=5');
    expect(res.body).toHaveLength(5);
  });
});

describe('PUT /tasks/:id', () => {
  test('partial update preserves other fields', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A', priority: 'high' });
    const res = await request(app).put(`/tasks/${c.body.id}`).send({ title: 'B' });
    expect(res.body.title).toBe('B');
    expect(res.body.priority).toBe('high');
  });
  test('404 for unknown id', async () => {
    const res = await request(app).put('/tasks/nope').send({ title: 'X' });
    expect(res.status).toBe(404);
  });
  test('400 for empty title', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    const res = await request(app).put(`/tasks/${c.body.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /tasks/:id', () => {
  test('204 on success', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    const res = await request(app).delete(`/tasks/${c.body.id}`);
    expect(res.status).toBe(204);
  });
  test('404 for unknown id', async () => {
    const res = await request(app).delete('/tasks/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks done and preserves priority', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A', priority: 'high' });
    const res = await request(app).patch(`/tasks/${c.body.id}/complete`);
    expect(res.body.status).toBe('done');
    expect(res.body.priority).toBe('high');
    expect(res.body.completedAt).not.toBeNull();
  });
  test('404 for unknown id', async () => {
    const res = await request(app).patch('/tasks/nope/complete');
    expect(res.status).toBe(404);
  });
});

describe('GET /tasks/stats', () => {
  test('zeros on empty store', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });
});

describe('PATCH /tasks/:id/assign', () => {
  test('assigns a name and returns the task', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/tasks/${c.body.id}/assign`).send({ assignee: 'Rohit' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Rohit');
  });
  test('404 for unknown id', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: 'X' });
    expect(res.status).toBe(404);
  });
  test('400 for missing assignee', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/tasks/${c.body.id}/assign`).send({});
    expect(res.status).toBe(400);
  });
  test('400 for empty assignee', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/tasks/${c.body.id}/assign`).send({ assignee: '   ' });
    expect(res.status).toBe(400);
  });
  test('400 for non-string assignee', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/tasks/${c.body.id}/assign`).send({ assignee: 123 });
    expect(res.status).toBe(400);
  });
  test('re-assign overwrites', async () => {
    const c = await request(app).post('/tasks').send({ title: 'A' });
    await request(app).patch(`/tasks/${c.body.id}/assign`).send({ assignee: 'A' });
    const res = await request(app).patch(`/tasks/${c.body.id}/assign`).send({ assignee: 'B' });
    expect(res.body.assignee).toBe('B');
  });
});