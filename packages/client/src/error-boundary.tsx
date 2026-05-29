import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

/** Contains any widget render crash so it never propagates to the host page. */
export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[comments] widget error (contained):', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.hasError ? null : this.props.children
  }
}
