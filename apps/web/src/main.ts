import { mount } from 'svelte';
import { defineControls } from '@youtubator/controls';
import App from './App.svelte';
import './app.css';

defineControls();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
