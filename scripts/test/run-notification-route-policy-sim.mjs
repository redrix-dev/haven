// Node-friendly route policy simulator for local/dev debugging.
// Mirrors the logic in src/lib/notifications/routePolicy.ts (kept intentionally close).

const DEFAULT_SINGLE_INPUT = {
  hasFocus: true,
  pushSupported: true,
  pushPermission: 'granted',
  swRegistered: true,
  pushSubscriptionActive: true,
  pushSyncEnabled: true,
  serviceWorkerRegistrationEnabled: true,
  audioSettings: {
    masterSoundEnabled: true,
    playSoundsWhenFocused: true,
  },
};

function printHelp() {
  console.log(`Usage: node scripts/test/run-notification-route-policy-sim.mjs [options]

Local route-policy simulator for notification routing behavior.

Modes:
  (default)     Runs a built-in matrix of common scenarios
  --single      Runs a single scenario from the provided flags

Output:
  --json        JSON output (otherwise human-readable)
  --assert-matrix Validate built-in matrix scenarios against expected outcomes (fails on drift)

Single-scenario flags (used with --single):
  --focus=<bool>                    App focus state
  --push-supported=<bool>           Browser push capability support
  --permission=<value>              granted | denied | default | unsupported
  --sw-registered=<bool>            Service worker registered/active
  --push-subscription-active=<bool> Active push subscription present
  --push-sync-enabled=<bool>        Local push sync toggle
  --sw-registration-enabled=<bool>  Local SW registration toggle
  --master-sound=<bool>             Local in-app master sound enabled
  --play-sounds-when-focused=<bool> In-app sounds when focused
  --label=<text>                    Label for single-scenario output

Assertions (CI-friendly, require --single):
  --expect-route-mode=<value>       Expected routeMode
  --expect-in-app-sound=<bool>      Expected allowInAppSound
  --expect-in-app-visual=<bool>     Expected allowInAppVisual
  --expect-os-push=<bool>           Expected allowOsPushDisplay
  --expect-reason=<code>            Require reason code (repeatable)
  --expect-no-reason=<code>         Require reason code to be absent (repeatable)

Examples:
  npm run test:notifications:route-sim
  npm run test:notifications:route-sim -- --assert-matrix
  npm run test:notifications:route-sim -- --json
  npm run test:notifications:route-sim -- --single --focus=false --permission=granted --sw-registered=true --push-subscription-active=true
  npm run test:notifications:route-sim -- --single --focus=false --permission=granted --sw-registered=true --push-subscription-active=true --expect-route-mode=background_os_push --expect-os-push=true --expect-in-app-sound=false
`);
}

function parseBooleanArg(raw, flagName) {
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new Error(`Invalid boolean for ${flagName}: "${raw}" (use true/false)`);
}

function parseArgs(argv) {
  const cloneDefaultInput =
    typeof structuredClone === 'function'
      ? structuredClone(DEFAULT_SINGLE_INPUT)
      : JSON.parse(JSON.stringify(DEFAULT_SINGLE_INPUT));
  const options = {
    help: false,
    json: false,
    single: false,
    assertMatrix: false,
    label: 'custom',
    input: cloneDefaultInput,
    expectations: {
      routeMode: null,
      allowInAppSound: null,
      allowInAppVisual: null,
      allowOsPushDisplay: null,
      includeReasons: [],
      excludeReasons: [],
    },
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--assert-matrix') {
      options.assertMatrix = true;
      continue;
    }
    if (arg === '--single') {
      options.single = true;
      continue;
    }
    if (arg.startsWith('--label=')) {
      options.label = arg.slice('--label='.length).trim() || 'custom';
      continue;
    }
    if (arg.startsWith('--expect-route-mode=')) {
      options.expectations.routeMode = arg.slice('--expect-route-mode='.length).trim() || null;
      continue;
    }
    if (arg.startsWith('--expect-in-app-sound=')) {
      options.expectations.allowInAppSound = parseBooleanArg(
        arg.slice('--expect-in-app-sound='.length),
        '--expect-in-app-sound'
      );
      continue;
    }
    if (arg.startsWith('--expect-in-app-visual=')) {
      options.expectations.allowInAppVisual = parseBooleanArg(
        arg.slice('--expect-in-app-visual='.length),
        '--expect-in-app-visual'
      );
      continue;
    }
    if (arg.startsWith('--expect-os-push=')) {
      options.expectations.allowOsPushDisplay = parseBooleanArg(
        arg.slice('--expect-os-push='.length),
        '--expect-os-push'
      );
      continue;
    }
    if (arg.startsWith('--expect-reason=')) {
      const reason = arg.slice('--expect-reason='.length).trim();
      if (!reason) throw new Error('Missing value for --expect-reason');
      options.expectations.includeReasons.push(reason);
      continue;
    }
    if (arg.startsWith('--expect-no-reason=')) {
      const reason = arg.slice('--expect-no-reason='.length).trim();
      if (!reason) throw new Error('Missing value for --expect-no-reason');
      options.expectations.excludeReasons.push(reason);
      continue;
    }

    const assign = (prefix, setter) => {
      if (!arg.startsWith(prefix)) return false;
      setter(arg.slice(prefix.length));
      return true;
    };

    if (
      assign('--focus=', (value) => {
        options.input.hasFocus = parseBooleanArg(value, '--focus');
      }) ||
      assign('--push-supported=', (value) => {
        options.input.pushSupported = parseBooleanArg(value, '--push-supported');
      }) ||
      assign('--permission=', (value) => {
        const normalized = value.trim().toLowerCase();
        if (!['granted', 'denied', 'default', 'unsupported'].includes(normalized)) {
          throw new Error(`Invalid --permission value "${value}"`);
        }
        options.input.pushPermission = normalized;
      }) ||
      assign('--sw-registered=', (value) => {
        options.input.swRegistered = parseBooleanArg(value, '--sw-registered');
      }) ||
      assign('--push-subscription-active=', (value) => {
        options.input.pushSubscriptionActive = parseBooleanArg(value, '--push-subscription-active');
      }) ||
      assign('--push-sync-enabled=', (value) => {
        options.input.pushSyncEnabled = parseBooleanArg(value, '--push-sync-enabled');
      }) ||
      assign('--sw-registration-enabled=', (value) => {
        options.input.serviceWorkerRegistrationEnabled = parseBooleanArg(
          value,
          '--sw-registration-enabled'
        );
      }) ||
      assign('--master-sound=', (value) => {
        options.input.audioSettings.masterSoundEnabled = parseBooleanArg(value, '--master-sound');
      }) ||
      assign('--play-sounds-when-focused=', (value) => {
        options.input.audioSettings.playSoundsWhenFocused = parseBooleanArg(
          value,
          '--play-sounds-when-focused'
        );
      })
    ) {
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function hasExpectations(expectations) {
  return Boolean(
    expectations.routeMode ||
      expectations.allowInAppSound !== null ||
      expectations.allowInAppVisual !== null ||
      expectations.allowOsPushDisplay !== null ||
      expectations.includeReasons.length > 0 ||
      expectations.excludeReasons.length > 0
  );
}

function resolveNotificationRoutePolicy(input) {
  const reasonCodes = [];

  const pushCapable =
    input.pushSupported &&
    input.pushPermission === 'granted' &&
    input.swRegistered &&
    (input.pushSyncEnabled ?? true) &&
    (input.serviceWorkerRegistrationEnabled ?? true) &&
    input.pushSubscriptionActive;

  if (!input.pushSupported) {
    reasonCodes.push('browser_push_unsupported');
  } else {
    if (input.pushPermission !== 'granted') {
      reasonCodes.push('notification_permission_not_granted');
    }
    if (!input.serviceWorkerRegistrationEnabled) {
      reasonCodes.push('service_worker_not_ready');
    } else if (!input.swRegistered) {
      reasonCodes.push('service_worker_not_ready');
    }
    if (!input.pushSyncEnabled) {
      reasonCodes.push('push_sync_disabled');
    }
    if (!input.pushSubscriptionActive) {
      reasonCodes.push('push_subscription_inactive');
    }
  }

  let routeMode;
  let allowOsPushDisplay = false;
  let allowInAppVisual = true;
  let allowInAppSound = true;

  if (input.hasFocus) {
    reasonCodes.push('app_focused');
    if (pushCapable) {
      reasonCodes.push('sw_focused_window_suppressed');
    }
    routeMode = pushCapable
      ? 'foreground_in_app'
      : input.pushSupported
        ? 'fallback_in_app'
        : 'unsupported_push';
    allowOsPushDisplay = false;
  } else if (pushCapable) {
    reasonCodes.push('app_backgrounded', 'in_app_suppressed_due_to_push_active_background');
    routeMode = 'background_os_push';
    allowOsPushDisplay = true;
    allowInAppSound = false;
  } else {
    reasonCodes.push('app_backgrounded', 'no_active_push_subscription');
    routeMode = input.pushSupported ? 'fallback_in_app' : 'unsupported_push';
    allowOsPushDisplay = false;
  }

  if (!input.audioSettings.masterSoundEnabled) {
    allowInAppSound = false;
    reasonCodes.push('sound_pref_disabled');
  } else if (input.hasFocus && input.audioSettings.playSoundsWhenFocused === false) {
    allowInAppSound = false;
    reasonCodes.push('sound_pref_disabled');
  }

  return {
    routeMode,
    allowInAppVisual,
    allowInAppSound,
    allowOsPushDisplay,
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}

function buildScenarioMatrix() {
  const mk = (label, patch) => ({
    label,
    input: {
      ...DEFAULT_SINGLE_INPUT,
      audioSettings: { ...DEFAULT_SINGLE_INPUT.audioSettings },
      ...patch,
      audioSettings: {
        ...DEFAULT_SINGLE_INPUT.audioSettings,
        ...(patch.audioSettings ?? {}),
      },
    },
  });

  return [
    mk('focused_push_active', {
      hasFocus: true,
      pushSupported: true,
      pushPermission: 'granted',
      swRegistered: true,
      pushSubscriptionActive: true,
      pushSyncEnabled: true,
      serviceWorkerRegistrationEnabled: true,
    }),
    mk('background_push_active', {
      hasFocus: false,
      pushSupported: true,
      pushPermission: 'granted',
      swRegistered: true,
      pushSubscriptionActive: true,
      pushSyncEnabled: true,
      serviceWorkerRegistrationEnabled: true,
    }),
    mk('background_push_permission_denied', {
      hasFocus: false,
      pushSupported: true,
      pushPermission: 'denied',
      swRegistered: true,
      pushSubscriptionActive: true,
    }),
    mk('background_push_no_subscription', {
      hasFocus: false,
      pushSupported: true,
      pushPermission: 'granted',
      swRegistered: true,
      pushSubscriptionActive: false,
    }),
    mk('background_push_sync_disabled', {
      hasFocus: false,
      pushSupported: true,
      pushPermission: 'granted',
      swRegistered: true,
      pushSubscriptionActive: true,
      pushSyncEnabled: false,
    }),
    mk('unsupported_push_browser', {
      hasFocus: false,
      pushSupported: false,
      pushPermission: 'unsupported',
      swRegistered: false,
      pushSubscriptionActive: false,
    }),
    mk('focused_sound_disabled_pref', {
      hasFocus: true,
      audioSettings: {
        playSoundsWhenFocused: false,
      },
    }),
    mk('focused_master_sound_off', {
      hasFocus: true,
      audioSettings: {
        masterSoundEnabled: false,
      },
    }),
  ];
}

function printHumanMatrix(rows) {
  console.log('');
  console.log('Notification Route Policy Matrix');
  console.log('-------------------------------');
  for (const row of rows) {
    const d = row.decision;
    console.log('');
    console.log(`${row.label}`);
    console.log(
      `- routeMode=${d.routeMode} inAppVisual=${d.allowInAppVisual} inAppSound=${d.allowInAppSound} osPush=${d.allowOsPushDisplay}`
    );
    console.log(`- reasons=${d.reasonCodes.join(', ')}`);
  }
}

function printHumanMatrixAssertions(result) {
  console.log('');
  console.log(`Matrix Assertions: ${result.ok ? 'PASS' : 'FAIL'}`);
  for (const row of result.rows) {
    console.log(`- [${row.ok ? 'ok' : 'x'}] ${row.label}`);
    for (const check of row.checks) {
      if (!check.ok) {
        console.log(`  mismatch: ${check.message}`);
      }
    }
  }
}

function printHumanSingle(result) {
  console.log('');
  console.log('Notification Route Policy Simulation');
  console.log('-----------------------------------');
  console.log(`Label: ${result.label}`);
  console.log(`Input: ${JSON.stringify(result.input)}`);
  console.log(`Decision: ${JSON.stringify(result.decision)}`);
  if (result.assertions) {
    console.log(`Assertions: ${result.assertions.ok ? 'PASS' : 'FAIL'}`);
    if (result.assertions.checks.length > 0) {
      for (const check of result.assertions.checks) {
        console.log(`- [${check.ok ? 'ok' : 'x'}] ${check.message}`);
      }
    }
  }
}

function evaluateExpectations(decision, expectations) {
  const checks = [];
  const reasonSet = new Set(Array.isArray(decision.reasonCodes) ? decision.reasonCodes : []);

  const pushCheck = (label, expected, actual) => {
    if (expected === null || typeof expected === 'undefined') return;
    checks.push({
      ok: actual === expected,
      message: `${label} expected=${expected} actual=${actual}`,
    });
  };

  if (expectations.routeMode) {
    checks.push({
      ok: decision.routeMode === expectations.routeMode,
      message: `routeMode expected=${expectations.routeMode} actual=${decision.routeMode}`,
    });
  }

  pushCheck('allowInAppSound', expectations.allowInAppSound, decision.allowInAppSound);
  pushCheck('allowInAppVisual', expectations.allowInAppVisual, decision.allowInAppVisual);
  pushCheck('allowOsPushDisplay', expectations.allowOsPushDisplay, decision.allowOsPushDisplay);

  for (const reason of expectations.includeReasons) {
    checks.push({
      ok: reasonSet.has(reason),
      message: `reason present "${reason}"`,
    });
  }

  for (const reason of expectations.excludeReasons) {
    checks.push({
      ok: !reasonSet.has(reason),
      message: `reason absent "${reason}"`,
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function getExpectedMatrixAssertions() {
  return {
    focused_push_active: {
      routeMode: 'foreground_in_app',
      allowInAppSound: true,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['app_focused', 'sw_focused_window_suppressed'],
      excludeReasons: ['app_backgrounded', 'in_app_suppressed_due_to_push_active_background'],
    },
    background_push_active: {
      routeMode: 'background_os_push',
      allowInAppSound: false,
      allowInAppVisual: true,
      allowOsPushDisplay: true,
      includeReasons: ['app_backgrounded', 'in_app_suppressed_due_to_push_active_background'],
      excludeReasons: ['app_focused', 'sw_focused_window_suppressed'],
    },
    background_push_permission_denied: {
      routeMode: 'fallback_in_app',
      allowInAppSound: true,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['notification_permission_not_granted', 'app_backgrounded', 'no_active_push_subscription'],
      excludeReasons: ['in_app_suppressed_due_to_push_active_background'],
    },
    background_push_no_subscription: {
      routeMode: 'fallback_in_app',
      allowInAppSound: true,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['push_subscription_inactive', 'app_backgrounded', 'no_active_push_subscription'],
      excludeReasons: ['in_app_suppressed_due_to_push_active_background'],
    },
    background_push_sync_disabled: {
      routeMode: 'fallback_in_app',
      allowInAppSound: true,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['push_sync_disabled', 'app_backgrounded', 'no_active_push_subscription'],
      excludeReasons: ['in_app_suppressed_due_to_push_active_background'],
    },
    unsupported_push_browser: {
      routeMode: 'unsupported_push',
      allowInAppSound: true,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['browser_push_unsupported', 'app_backgrounded', 'no_active_push_subscription'],
      excludeReasons: ['sw_focused_window_suppressed'],
    },
    focused_sound_disabled_pref: {
      routeMode: 'foreground_in_app',
      allowInAppSound: false,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['app_focused', 'sw_focused_window_suppressed', 'sound_pref_disabled'],
      excludeReasons: ['app_backgrounded'],
    },
    focused_master_sound_off: {
      routeMode: 'foreground_in_app',
      allowInAppSound: false,
      allowInAppVisual: true,
      allowOsPushDisplay: false,
      includeReasons: ['app_focused', 'sw_focused_window_suppressed', 'sound_pref_disabled'],
      excludeReasons: ['app_backgrounded'],
    },
  };
}

function evaluateMatrixAssertions(matrix) {
  const expectedByLabel = getExpectedMatrixAssertions();
  const rows = [];

  for (const row of matrix) {
    const expected = expectedByLabel[row.label];
    if (!expected) {
      rows.push({
        label: row.label,
        ok: false,
        checks: [{ ok: false, message: 'No expected assertion entry for scenario label' }],
      });
      continue;
    }

    const assertionResult = evaluateExpectations(row.decision, expected);
    rows.push({
      label: row.label,
      ok: assertionResult.ok,
      checks: assertionResult.checks,
    });
  }

  for (const label of Object.keys(expectedByLabel)) {
    if (!matrix.some((row) => row.label === label)) {
      rows.push({
        label,
        ok: false,
        checks: [{ ok: false, message: 'Expected scenario missing from built-in matrix' }],
      });
    }
  }

  return {
    ok: rows.every((row) => row.ok),
    rows,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.single && hasExpectations(options.expectations)) {
    throw new Error('Expectation flags require --single mode.');
  }

  if (options.single) {
    const decision = resolveNotificationRoutePolicy(options.input);
    const assertions = hasExpectations(options.expectations)
      ? evaluateExpectations(decision, options.expectations)
      : null;
    const result = {
      label: options.label,
      input: options.input,
      decision,
      assertions,
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      printHumanSingle(result);
    }
    if (assertions && !assertions.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const matrix = buildScenarioMatrix().map((row) => ({
    ...row,
    decision: resolveNotificationRoutePolicy(row.input),
  }));
  const matrixAssertions = options.assertMatrix ? evaluateMatrixAssertions(matrix) : null;

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ scenarios: matrix, assertions: matrixAssertions }, null, 2)}\n`
    );
  } else {
    printHumanMatrix(matrix);
    if (matrixAssertions) {
      printHumanMatrixAssertions(matrixAssertions);
    }
  }

  if (matrixAssertions && !matrixAssertions.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error('[route-sim] Failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
