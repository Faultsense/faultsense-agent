# @faultsense/panel-collector

In-page debug panel for [Faultsense](https://faultsense.com). Shows real-time assertion pass/fail results in a shadow-DOM overlay, with an X-Ray mode that highlights every `fs-assert` element on the page.

Designed for local development and staging environments. For production, use an HTTPS collector URL.

## Install

```bash
npm install --save-dev @faultsense/agent @faultsense/panel-collector
```

## Use

```js
import { init } from '@faultsense/agent';
import { panelCollector } from '@faultsense/panel-collector';

init({
  releaseLabel: 'dev',
  collectorURL: panelCollector,
});
```

## Script tag

Load the panel collector bundle before the agent bundle so it can self-register onto `window.Faultsense.collectors.panel`:

```html
<script src="https://cdn.faultsense.com/v0/faultsense-panel.min.js" defer></script>
<script
  id="fs-agent"
  src="https://cdn.faultsense.com/v0/faultsense-agent.min.js"
  data-collector-url="panel"
  data-release-label="dev"
  defer></script>
```

## Bundler auto-register

If you're using a bundler and want script-tag parity — i.e. the agent reads `data-collector-url="panel"` off a script tag in your HTML — import the auto entry:

```js
import '@faultsense/agent/auto';
import '@faultsense/panel-collector/auto';
```

## Peer dependency

`@faultsense/panel-collector` peer-depends on `@faultsense/agent`. This ensures a single shared copy of the agent in your bundle so `window.Faultsense.collectors` isn't split-brained across duplicate module instances.

## License

FSL-1.1-ALv2
