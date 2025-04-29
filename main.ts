import { Gantt } from './src';

const gantt = new Gantt(
  '#gantt',
  [
    { id: '1', name: 'Task 1', start: new Date(), end: new Date(2025, 4, 25), group_index: 0 },
    { id: '2', name: 'Task 1', start: new Date(2025, 4, 25), end: new Date(2025, 4, 28), group_index: 1 },
    { id: '3', name: 'Task 1', start: new Date(2025, 4, 28), end: new Date(2025, 4, 30), group_index: 0 },
    { id: '4', name: 'Task 1', start: new Date(), end: new Date(2025, 4, 25) },
    { id: '5', name: 'Task 1', start: new Date(), end: new Date(2025, 4, 25) },
    { id: '6', name: 'Task 1', start: new Date(), end: new Date(2025, 4, 25) },
    { id: '7', name: 'Task 1', start: new Date(), end: new Date(2025, 4, 25) },
    { id: '8', name: 'Task 1', start: new Date(), end: new Date(2025, 4, 25) },
  ],
  { language: 'ko' },
);
