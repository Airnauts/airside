// packages/client/src/ui/ThreadActions.test.tsx
import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import type { Controller } from '../threads/controller'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useDispatch } from '../threads/useThreads'
import { ThreadActions } from './ThreadActions'
import { ToastProvider } from './toast'

const toolbarAction = (over: Partial<ThreadActionDescriptor> = {}): ThreadActionDescriptor => ({
  id: 'jira.createIssue',
  provider: 'jira',
  label: 'Create issue',
  slot: 'thread-toolbar',
  ...over,
})

const metadataAction = (over: Partial<ThreadActionDescriptor> = {}): ThreadActionDescriptor => ({
  id: 'jira.openIssue',
  provider: 'jira',
  label: 'Open in Jira',
  slot: 'thread-metadata',
  ...over,
})

const stubController = (over: Partial<Controller> = {}) =>
  ({ runAction: vi.fn().mockResolvedValue(true), ...over }) as unknown as Controller

const stubClient = () => ({ getThread: vi.fn() }) as never

describe('ThreadActions', () => {
  it('renders a button for a thread-toolbar action and ignores other slots', () => {
    render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions
          id="a"
          actions={[toolbarAction(), metadataAction()]}
          controller={stubController()}
        />
      </ThreadsProvider>,
    )
    expect(screen.getByRole('button', { name: /create issue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open in jira/i })).not.toBeInTheDocument()
  })

  it('renders nothing when there are no toolbar actions', () => {
    const { container } = render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions id="a" actions={[metadataAction()]} controller={stubController()} />
      </ThreadsProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('clicking calls controller.runAction with the thread id and action id', () => {
    const controller = stubController()
    render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions id="a" actions={[toolbarAction()]} controller={controller} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /create issue/i }))
    expect(controller.runAction).toHaveBeenCalledWith('a', 'jira.createIssue')
  })

  it('shows a toast when runAction resolves false', async () => {
    const controller = stubController({ runAction: vi.fn().mockResolvedValue(false) })
    render(
      <WidgetProvider>
        <ToastProvider>
          <ThreadsProvider client={stubClient()}>
            <ThreadActions id="a" actions={[toolbarAction()]} controller={controller} />
          </ThreadsProvider>
        </ToastProvider>
      </WidgetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /create issue/i }))
    expect(await screen.findByText(/create issue failed/i)).toBeInTheDocument()
  })

  it('disables the button while its action is running', () => {
    function Harness() {
      const dispatch = useDispatch()
      return (
        <>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'ACTION_RUNNING', id: 'a', actionId: 'jira.createIssue' })
            }
          >
            mark-running
          </button>
          <ThreadActions id="a" actions={[toolbarAction()]} controller={stubController()} />
        </>
      )
    }
    render(
      <ThreadsProvider client={stubClient()}>
        <Harness />
      </ThreadsProvider>,
    )
    const button = screen.getByRole('button', { name: /create issue/i })
    expect(button).not.toBeDisabled()
    fireEvent.click(screen.getByText('mark-running'))
    expect(screen.getByRole('button', { name: /create issue/i })).toBeDisabled()
  })
})
