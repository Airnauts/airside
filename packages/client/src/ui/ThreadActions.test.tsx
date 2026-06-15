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

/** Open the ⋯ overflow menu via the keyboard path (Enter on focused trigger).
 *  If the menu is already open (trigger is aria-hidden by Radix), close it first. */
function openMenu() {
  // When menu is open, Radix marks the rest of the page aria-hidden. Use hidden:true to reach the trigger.
  const trigger = screen.getByRole('button', { name: /more actions/i, hidden: true })
  // If the menu is already open, close it with Escape then reopen.
  if (trigger.getAttribute('data-state') === 'open') {
    fireEvent.keyDown(trigger, { key: 'Escape' })
  }
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

describe('ThreadActions', () => {
  it('renders a ⋯ trigger and shows toolbar actions (only) once opened', () => {
    render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions
          id="a"
          actions={[toolbarAction(), metadataAction()]}
          controller={stubController()}
        />
      </ThreadsProvider>,
    )
    // Closed: no menu items yet.
    expect(screen.queryByRole('menuitem', { name: /create issue/i })).not.toBeInTheDocument()
    openMenu()
    expect(screen.getByRole('menuitem', { name: /create issue/i })).toBeInTheDocument()
    // thread-metadata actions never appear in the toolbar overflow.
    expect(screen.queryByRole('menuitem', { name: /open in jira/i })).not.toBeInTheDocument()
  })

  it('renders nothing when there are no toolbar actions', () => {
    const { container } = render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions id="a" actions={[metadataAction()]} controller={stubController()} />
      </ThreadsProvider>,
    )
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('selecting an item calls controller.runAction with the thread id and action id', () => {
    const controller = stubController()
    render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions id="a" actions={[toolbarAction()]} controller={controller} />
      </ThreadsProvider>,
    )
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /create issue/i }))
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
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /create issue/i }))
    expect(await screen.findByText(/create issue failed/i)).toBeInTheDocument()
  })

  it('disables the menu item while its action is running', () => {
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
    openMenu()
    expect(screen.getByRole('menuitem', { name: /create issue/i })).not.toHaveAttribute(
      'data-disabled',
    )
    fireEvent.click(screen.getByText('mark-running'))
    openMenu()
    expect(screen.getByRole('menuitem', { name: /create issue/i })).toHaveAttribute('data-disabled')
  })
})
