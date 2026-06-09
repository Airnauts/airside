import type { z } from 'zod'
import { Attachment, Comment } from '../schemas/comment'
import { ThreadListItemView, ThreadView } from '../schemas/thread'
import type { ErrorCode } from './errors'
import {
  AddCommentBody,
  CreateThreadBody,
  ListThreadsQuery,
  RefreshAnchorBody,
  SetThreadStatusBody,
  ThreadActionParam,
  ThreadIdParam,
} from './requests'
import { ThreadListResponse } from './responses'

export interface Operation {
  operationId: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  summary: string
  params?: z.ZodObject
  query?: z.ZodObject
  body?: z.ZodType | 'multipart'
  success: { status: number; schema: z.ZodType }
  errors: ErrorCode[]
}

const AUTH_ERRORS: ErrorCode[] = ['AUTH_INVALID_KEY', 'ORIGIN_NOT_ALLOWED', 'RATE_LIMITED']

export const operations: Operation[] = [
  {
    operationId: 'createThread',
    method: 'POST',
    path: '/threads',
    summary: 'Create a thread with its first comment',
    body: CreateThreadBody,
    success: { status: 201, schema: ThreadView },
    errors: ['VALIDATION_FAILED', ...AUTH_ERRORS],
  },
  {
    operationId: 'listThreads',
    method: 'GET',
    path: '/threads',
    summary: 'List threads on a page (?pageKey=) or across all pages (panel)',
    query: ListThreadsQuery,
    success: { status: 200, schema: ThreadListResponse },
    errors: ['VALIDATION_FAILED', ...AUTH_ERRORS],
  },
  {
    operationId: 'getThread',
    method: 'GET',
    path: '/threads/:id',
    summary: 'Get a single thread with its comments',
    params: ThreadIdParam,
    success: { status: 200, schema: ThreadView },
    errors: ['NOT_FOUND', ...AUTH_ERRORS],
  },
  {
    operationId: 'addComment',
    method: 'POST',
    path: '/threads/:id/comments',
    summary: 'Add a reply to a thread',
    params: ThreadIdParam,
    body: AddCommentBody,
    success: { status: 201, schema: Comment },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', ...AUTH_ERRORS],
  },
  {
    operationId: 'setThreadStatus',
    method: 'PATCH',
    path: '/threads/:id',
    summary: 'Resolve or reopen a thread',
    params: ThreadIdParam,
    body: SetThreadStatusBody,
    success: { status: 200, schema: ThreadView },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', ...AUTH_ERRORS],
  },
  {
    operationId: 'refreshAnchor',
    method: 'PATCH',
    path: '/threads/:id/anchor',
    summary: 'Report a re-match result (self-heal the stored anchor)',
    params: ThreadIdParam,
    body: RefreshAnchorBody,
    success: { status: 200, schema: ThreadListItemView },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', ...AUTH_ERRORS],
  },
  {
    operationId: 'runThreadAction',
    method: 'POST',
    path: '/threads/:id/actions/:actionId',
    summary: 'Run a registered manual thread action (e.g. create a Jira issue)',
    params: ThreadActionParam,
    success: { status: 200, schema: ThreadView },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', 'INTEGRATION_ERROR', ...AUTH_ERRORS],
  },
  {
    operationId: 'uploadAttachment',
    method: 'POST',
    path: '/uploads',
    summary: 'Upload an image attachment (multipart)',
    body: 'multipart',
    success: { status: 201, schema: Attachment },
    errors: ['VALIDATION_FAILED', 'UPLOAD_TOO_LARGE', ...AUTH_ERRORS],
  },
]
