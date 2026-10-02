import { Component } from 'react';
import { clearSession } from '../repository/storage';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('Unexpected UI error:', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fatal" id="main">
        <h1>Something went wrong</h1>
        <p>The page hit an unexpected problem. Your data is safe. Reload to continue.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn" onClick={() => { clearSession(); window.location.hash = '#/login'; window.location.reload(); }}>
            Sign out and reload
          </button>
        </div>
      </div>
    );
  }
}
