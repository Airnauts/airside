import {
  type AttachmentId,
  type AuthorId,
  type CommentId,
  DEFAULT_THREAD_PARAM,
  type ThreadId,
} from '@airnauts/airside-core'
import { nanoid } from 'nanoid'

export type IdFactory = {
  thread(): ThreadId
  comment(): CommentId
  author(): AuthorId
  attachment(): AttachmentId
}

export function defaultIds(): IdFactory {
  return {
    thread: () => `t_${nanoid(12)}` as ThreadId,
    comment: () => `c_${nanoid(12)}` as CommentId,
    author: () => `a_${nanoid(12)}` as AuthorId,
    attachment: () => `at_${nanoid(12)}` as AttachmentId,
  }
}

export type Ctx = {
  projectId: string
  env?: string
  threadParam: string
  now: () => Date
  ids: IdFactory
}

export type CtxInit = {
  projectId: string
  env?: string
  threadParam?: string
  now?: () => Date
  ids?: IdFactory
}

export function makeCtx(init: CtxInit): Ctx {
  return {
    projectId: init.projectId,
    env: init.env,
    threadParam: init.threadParam ?? DEFAULT_THREAD_PARAM,
    now: init.now ?? (() => new Date()),
    ids: init.ids ?? defaultIds(),
  }
}
