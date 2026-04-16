# @faultsense/console-collector

Console logger collector for [Faultsense](https://faultsense.com). Each assertion result is logged to the browser devtools console as a collapsible group with the full payload. Useful for local development and CI smoke tests where you want to watch assertions without running a real backend.

## Install

```bash
npm install --save-dev @faultsense/agent @faultsense/console-collector
```

## Use

```js
import { init } from '@faultsense/agent';
import { consoleCollector } from '@faultsense/console-collector';

init({
  releaseLabel: 'dev',
  collectorURL: consoleCollector,
});
```

## Script tag

Load the console collector bundle before the agent bundle so it can self-register onto `window.Faultsense.collectors.console`:

```html
<script src="https://cdn.faultsense.com/v0/faultsense-console.min.js" defer></script>
<script
  id="fs-agent"
  src="https://cdn.faultsense.com/v0/faultsense-agent.min.js"
  data-collector-url="console"
  data-release-label="dev"
  defer></script>
```

## Bundler auto-register

If you want script-tag parity in a bundler context, import the auto entry:

```js
import '@faultsense/agent/auto';
import '@faultsense/console-collector/auto';
```

## Peer dependency

`@faultsense/console-collector` peer-depends on `@faultsense/agent`. This ensures a single shared copy of the agent in your bundle so `window.Faultsense.collectors` isn't split-brained across duplicate module instances.

## License

FSL-1.1-ALv2
