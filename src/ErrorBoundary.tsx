import React from 'react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message?: string }>{
  constructor(props:any){ super(props); this.state = { hasError:false }; }
  static getDerivedStateFromError(err: any){ return { hasError:true, message: String(err) }; }
  componentDidCatch(err:any, info:any){ console.error('ErrorBoundary', err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:16}}>
          <h3>Algo salió mal</h3>
          <pre style={{whiteSpace:'pre-wrap'}}>{this.state.message}</pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}
