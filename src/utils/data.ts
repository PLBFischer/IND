import type { DataFileAttachment, DataNode } from '../types/graph';
import { createId } from './graph';

export const createDataFileAttachment = (file: File): DataFileAttachment => ({
  id: createId('data_file'),
  name: file.name,
  sizeBytes: file.size,
  mimeType: file.type || 'application/octet-stream',
  uploadedAt: new Date().toISOString(),
});

export const createEmptyDataNode = (
  id: string,
  title: string,
  x: number,
  y: number,
): DataNode => ({
  id,
  nodeKind: 'data',
  title,
  x,
  y,
  description: '',
  files: [],
  linkedExperimentNodeIds: [],
});
