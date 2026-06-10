import {
  CHAT_COMPOSER_MIN_HEIGHT,
  CHAT_LIST_TOP_PADDING,
  CHAT_SURFACE_MARGIN,
} from "@/components/chat/chatSurfaceConstants";

export const CHAT_SURFACE_LAYOUT_DEBUG_TAG = "[ChatSurfaceLayout]";

export function isChatSurfaceLayoutDebugEnabled(): boolean {
  return __DEV__;
}

export function chatSurfaceLayoutTimestamp(): string {
  return new Date().toISOString();
}

export type ChatSurfaceKeyboardPhase =
  | "willShow"
  | "didShow"
  | "willHide"
  | "didHide"
  | "interactive"
  | "move";

/** RNKC: max(blankSpace, keyboardPadding + extraContentPadding) — blankSpace removed in app code. */
export function computeRnkcEffectiveBottomPadding(input: {
  extraContentPadding: number;
  keyboardHeight: number;
  blankSpace?: number;
}): number {
  const keyboardPadding = input.keyboardHeight;
  const extra = input.extraContentPadding;
  const blank = input.blankSpace ?? 0;
  return Math.max(blank, keyboardPadding + extra);
}

export type ChatSurfaceLayoutEvaluation = {
  /** List paddingTop (inverted visual-bottom gap in contentContainerStyle). */
  listPaddingTop: number;
  paddingMinusSticky: number | null;
  paddingMinusStickyMinusSafeArea: number | null;
  /** Current app formula: max(sticky - baseline, 0). */
  extraTargetBaselineDelta: number | null;
  /** Old blankSpace formula: max(sticky - safeArea.bottom, 0). */
  legacyBlankSpaceEstimate: number | null;
  /** Doc growth-only: max(sticky - minInputRow ~36, 0) — approximate. */
  docGrowthAboveMinInputRow: number | null;
  /**
   * Inverted RNKC maps bottomPadding → contentInset.top (see ScrollViewWithBottomPadding).
   * max(blankSpace, keyboardPadding + extraContentPadding).
   */
  rnkcContentInsetTopClosed: number;
  rnkcContentInsetTopCurrent: number;
  rnkcContentInsetTopIfLegacyBlankSpace: number | null;
  /** @deprecated alias — same as rnkcContentInsetTopClosed when sticky unknown. */
  rnkcEffectiveBottomClosed: number | null;
  rnkcEffectiveBottomCurrent: number | null;
  rnkcEffectiveBottomIfLegacyBlankSpace: number | null;
  /** paddingTop + rnkc inset (inverted visual-bottom scroll reserve). */
  totalInvertedBottomReserveClosed: number;
  totalInvertedBottomReserveCurrent: number;
  totalInvertedBottomReserveIfLegacyBlank: number | null;
  /** Composer top edge from screen bottom (sticky bottom offset + height). */
  composerTopFromScreenBottom: number | null;
  /**
   * How far short list padding + RNKC inset are vs clearing the overlay composer.
   * Positive ≈ overlap risk (messages under sticky pill).
   */
  paddingInsetShortfallVsComposerTop: number | null;
  paddingInsetShortfallVsComposerTopIfLegacyBlank: number | null;
  /** totalReserve - stickyHeight (positive = surplus scroll reserve). */
  clearanceGapVsStickyClosed: number | null;
  clearanceGapVsStickyIfLegacyBlank: number | null;
  /** @deprecated — use totalInvertedBottomReserveClosed */
  heuristicTotalReserveClosed: number | null;
  /** Sticky bottom edge from screen bottom (styleBottom + stickyHeight). */
  stickyTopFromScreenBottom: number | null;
  /** RNKC doc-aligned fix hints (no blankSpace — that prop is for AI streaming UIs). */
  docFixHints: {
    measuredStickyBelowMinHeight: boolean;
    listPaddingMatchesDocFormula: boolean;
    recommendedMinInputHeight: number | null;
    recommendedListPaddingTop: number | null;
    recommendedExtraAtRest: number;
  };
};

export type ChatSurfaceLayoutDiagnostics = {
  /** react-native-keyboard-controller@1.21.0 has no onContentInsetChange — insets are computed. */
  rnkcVersion: string;
  contentInsetSource: "computed-from-rnkc-formula";
  scrollViewLayout: { width: number; height: number } | null;
  chatHostLayout: { width: number; height: number } | null;
  keyboardChatScrollViewMounted: boolean;
  extraPaddingTargetLast: number | null;
  extraPaddingSettledLast: number | null;
};

export type ChatSurfaceLayoutSnapshot = {
  ts: string;
  event: string;
  surface?: string;
  keyboard: {
    phase?: ChatSurfaceKeyboardPhase;
    visible: boolean;
    height: number;
    progress: number;
    controllerIsVisible?: boolean;
  };
  safeArea: {
    bottom: number;
  };
  constants: {
    chatListTopPadding: number;
    composerMinHeight: number;
    surfaceMargin: number;
    docMinInputRowHeight: number;
  };
  scrollView: {
    offset: number;
    keyboardLiftBehavior?: string;
    invertedProp?: boolean;
    invertedExplicitOnKcsv?: boolean;
    /** Computed inverted contentInset.top — not from a runtime callback in RNKC 1.21. */
    computedContentInsetTop: number;
  };
  composer: {
    stickyLayoutHeight: number | null;
    extraContentPaddingLive: number;
    extraContentPaddingTarget: number | null;
    extraContentPaddingSettled: number | null;
    legacyBlankSpaceEstimate: number | null;
    deltaAboveBaseline: number | null;
    staticClearanceEstimate: number | null;
  };
  stickyView: {
    styleBottom: number;
    offsetOpened: number;
  };
  evaluation: ChatSurfaceLayoutEvaluation;
  diagnostics: ChatSurfaceLayoutDiagnostics;
};

const DOC_MIN_INPUT_ROW_HEIGHT = 36;

export function buildChatSurfaceLayoutEvaluation(input: {
  stickyLayoutHeight: number | null;
  safeAreaBottom: number;
  extraContentPadding: number;
  keyboardHeight: number;
  styleBottom: number;
}): ChatSurfaceLayoutEvaluation {
  const sticky = input.stickyLayoutHeight;
  const safeBottom = input.safeAreaBottom;
  const extra = input.extraContentPadding;
  const kb = input.keyboardHeight;

  const legacyBlank = sticky == null ? null : Math.max(sticky - safeBottom, 0);
  const baselineDelta =
    sticky == null ? null : Math.max(sticky - CHAT_COMPOSER_MIN_HEIGHT, 0);
  const docGrowth =
    sticky == null ? null : Math.max(sticky - DOC_MIN_INPUT_ROW_HEIGHT, 0);

  const rnkcInsetClosed = computeRnkcEffectiveBottomPadding({
    extraContentPadding: extra,
    keyboardHeight: 0,
  });
  const rnkcInsetCurrent = computeRnkcEffectiveBottomPadding({
    extraContentPadding: extra,
    keyboardHeight: kb,
  });
  const rnkcInsetLegacy =
    legacyBlank == null
      ? null
      : computeRnkcEffectiveBottomPadding({
          extraContentPadding: extra,
          keyboardHeight: kb,
          blankSpace: legacyBlank,
        });

  const totalClosed = CHAT_LIST_TOP_PADDING + rnkcInsetClosed;
  const totalCurrent = CHAT_LIST_TOP_PADDING + rnkcInsetCurrent;
  const totalLegacy =
    rnkcInsetLegacy == null ? null : CHAT_LIST_TOP_PADDING + rnkcInsetLegacy;

  const composerTop = sticky == null ? null : CHAT_SURFACE_MARGIN + sticky;
  const shortfall = composerTop == null ? null : composerTop - totalClosed;
  const shortfallLegacy =
    composerTop == null || totalLegacy == null
      ? null
      : composerTop - totalLegacy;

  const docListPadding = sticky == null ? null : sticky + CHAT_SURFACE_MARGIN;

  return {
    listPaddingTop: CHAT_LIST_TOP_PADDING,
    paddingMinusSticky: sticky == null ? null : CHAT_LIST_TOP_PADDING - sticky,
    paddingMinusStickyMinusSafeArea:
      sticky == null ? null : CHAT_LIST_TOP_PADDING - sticky - safeBottom,
    extraTargetBaselineDelta: baselineDelta,
    legacyBlankSpaceEstimate: legacyBlank,
    docGrowthAboveMinInputRow: docGrowth,
    rnkcContentInsetTopClosed: rnkcInsetClosed,
    rnkcContentInsetTopCurrent: rnkcInsetCurrent,
    rnkcContentInsetTopIfLegacyBlankSpace: rnkcInsetLegacy,
    rnkcEffectiveBottomClosed: rnkcInsetClosed,
    rnkcEffectiveBottomCurrent: rnkcInsetCurrent,
    rnkcEffectiveBottomIfLegacyBlankSpace: rnkcInsetLegacy,
    totalInvertedBottomReserveClosed: totalClosed,
    totalInvertedBottomReserveCurrent: totalCurrent,
    totalInvertedBottomReserveIfLegacyBlank: totalLegacy,
    composerTopFromScreenBottom: composerTop,
    paddingInsetShortfallVsComposerTop: shortfall,
    paddingInsetShortfallVsComposerTopIfLegacyBlank: shortfallLegacy,
    clearanceGapVsStickyClosed: sticky == null ? null : totalClosed - sticky,
    clearanceGapVsStickyIfLegacyBlank:
      sticky == null || totalLegacy == null ? null : totalLegacy - sticky,
    heuristicTotalReserveClosed: totalClosed,
    stickyTopFromScreenBottom: composerTop,
    docFixHints: {
      measuredStickyBelowMinHeight:
        sticky != null && sticky < CHAT_COMPOSER_MIN_HEIGHT,
      listPaddingMatchesDocFormula:
        docListPadding != null && docListPadding === CHAT_LIST_TOP_PADDING,
      recommendedMinInputHeight: sticky,
      recommendedListPaddingTop: docListPadding,
      recommendedExtraAtRest: extra,
    },
  };
}

export function buildChatSurfaceLayoutSnapshot(input: {
  event: string;
  surface?: string;
  safeAreaBottom: number;
  keyboard?: Partial<ChatSurfaceLayoutSnapshot["keyboard"]>;
  scrollView?: Partial<ChatSurfaceLayoutSnapshot["scrollView"]>;
  composer?: Partial<ChatSurfaceLayoutSnapshot["composer"]>;
  diagnostics?: Partial<ChatSurfaceLayoutDiagnostics>;
}): ChatSurfaceLayoutSnapshot {
  const stickyLayoutHeight = input.composer?.stickyLayoutHeight ?? null;
  const extraContentPaddingLive = input.composer?.extraContentPaddingLive ?? 0;
  const safeBottom = input.safeAreaBottom;
  const keyboardHeight = input.keyboard?.height ?? 0;
  const styleBottom = CHAT_SURFACE_MARGIN;

  const evaluation = buildChatSurfaceLayoutEvaluation({
    stickyLayoutHeight,
    safeAreaBottom: safeBottom,
    extraContentPadding: extraContentPaddingLive,
    keyboardHeight,
    styleBottom,
  });

  const diagnostics: ChatSurfaceLayoutDiagnostics = {
    rnkcVersion: "1.21.0",
    contentInsetSource: "computed-from-rnkc-formula",
    scrollViewLayout: input.diagnostics?.scrollViewLayout ?? null,
    chatHostLayout: input.diagnostics?.chatHostLayout ?? null,
    keyboardChatScrollViewMounted:
      input.diagnostics?.keyboardChatScrollViewMounted ?? false,
    extraPaddingTargetLast: input.composer?.extraContentPaddingTarget ?? null,
    extraPaddingSettledLast: input.composer?.extraContentPaddingSettled ?? null,
  };

  return {
    ts: chatSurfaceLayoutTimestamp(),
    event: input.event,
    surface: input.surface,
    keyboard: {
      phase: input.keyboard?.phase,
      visible: input.keyboard?.visible ?? false,
      height: keyboardHeight,
      progress: input.keyboard?.progress ?? 0,
      controllerIsVisible: input.keyboard?.controllerIsVisible,
    },
    safeArea: {
      bottom: safeBottom,
    },
    constants: {
      chatListTopPadding: CHAT_LIST_TOP_PADDING,
      composerMinHeight: CHAT_COMPOSER_MIN_HEIGHT,
      surfaceMargin: CHAT_SURFACE_MARGIN,
      docMinInputRowHeight: DOC_MIN_INPUT_ROW_HEIGHT,
    },
    scrollView: {
      offset: input.scrollView?.offset ?? styleBottom,
      keyboardLiftBehavior: input.scrollView?.keyboardLiftBehavior,
      invertedProp: input.scrollView?.invertedProp,
      invertedExplicitOnKcsv: input.scrollView?.invertedExplicitOnKcsv,
      computedContentInsetTop: evaluation.rnkcContentInsetTopCurrent,
    },
    composer: {
      stickyLayoutHeight,
      extraContentPaddingLive,
      extraContentPaddingTarget:
        input.composer?.extraContentPaddingTarget ?? null,
      extraContentPaddingSettled:
        input.composer?.extraContentPaddingSettled ?? null,
      legacyBlankSpaceEstimate:
        stickyLayoutHeight == null
          ? null
          : Math.max(stickyLayoutHeight - safeBottom, 0),
      deltaAboveBaseline:
        stickyLayoutHeight == null
          ? null
          : Math.max(stickyLayoutHeight - CHAT_COMPOSER_MIN_HEIGHT, 0),
      staticClearanceEstimate: CHAT_LIST_TOP_PADDING + extraContentPaddingLive,
    },
    stickyView: {
      styleBottom,
      offsetOpened: styleBottom,
    },
    evaluation,
    diagnostics,
  };
}

export function formatChatSurfaceLayoutConclusion(
  snapshot: ChatSurfaceLayoutSnapshot,
): string {
  const { evaluation: ev, composer } = snapshot;
  const sticky = composer.stickyLayoutHeight;
  const parts: string[] = [];

  if (sticky != null) {
    parts.push(`sticky=${sticky}px`);
    parts.push(`paddingTop=${ev.listPaddingTop}`);
    parts.push(`rnkcInsetTop=${ev.rnkcContentInsetTopClosed}`);
    parts.push(`totalReserve=${ev.totalInvertedBottomReserveClosed}`);
    if (ev.composerTopFromScreenBottom != null) {
      parts.push(`composerTop=${ev.composerTopFromScreenBottom}px`);
    }
    if (ev.paddingInsetShortfallVsComposerTop != null) {
      const s = ev.paddingInsetShortfallVsComposerTop;
      parts.push(
        s > 0.5
          ? `SHORTFALL≈${Math.round(s)}px (overlap risk)`
          : `clearanceOK (margin=${Math.round(-s)}px)`,
      );
    }
    if (ev.legacyBlankSpaceEstimate != null) {
      parts.push(`legacyBlankSpace=${ev.legacyBlankSpaceEstimate}`);
    }
    if (ev.docFixHints.listPaddingMatchesDocFormula) {
      parts.push("→ paddingTop matches RNKC INPUT_HEIGHT+MARGIN");
    } else if (ev.docFixHints.recommendedListPaddingTop != null) {
      parts.push(
        `→ doc paddingTop=${ev.docFixHints.recommendedListPaddingTop}`,
      );
    }
    if (ev.docFixHints.measuredStickyBelowMinHeight) {
      parts.push(
        `→ minHeight ${snapshot.constants.composerMinHeight} > measured sticky`,
      );
    }
  } else {
    parts.push("awaiting composer layout");
  }

  return parts.join(" | ");
}

export function logChatSurfaceLayoutSnapshot(
  snapshot: ChatSurfaceLayoutSnapshot,
): void {
  if (!isChatSurfaceLayoutDebugEnabled()) return;
  const conclusion = formatChatSurfaceLayoutConclusion(snapshot);
  console.log(
    `${CHAT_SURFACE_LAYOUT_DEBUG_TAG} ${snapshot.event}`,
    JSON.stringify(snapshot, null, 2),
  );
  if (
    snapshot.event === "probe:t+500ms" ||
    snapshot.event === "probe:t+1500ms" ||
    snapshot.event.startsWith("composer:onLayout")
  ) {
    console.log(
      `${CHAT_SURFACE_LAYOUT_DEBUG_TAG} CONCLUSION ${snapshot.event} — ${conclusion}`,
    );
  }
}
