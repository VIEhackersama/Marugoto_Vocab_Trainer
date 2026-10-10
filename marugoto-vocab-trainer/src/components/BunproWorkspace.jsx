import React from 'react';
import './bunpro.css';
import { BunproCatalogWorkspace } from './BunproCatalogWorkspace.jsx';

export function BunproWorkspace(props) {
  return <BunproCatalogWorkspace key={props.kind || 'VOCAB'} {...props} />;
}
