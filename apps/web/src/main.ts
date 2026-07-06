import { mount } from 'svelte';
import { defineControls } from 'potard';
import App from './App.svelte';
import './app.css';

defineControls();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
