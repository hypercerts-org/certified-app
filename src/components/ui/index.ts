/**
 * Barrel for the certified-app UI component library (the canonical source of
 * truth for hypercerts-org apps). Re-exports every primitive's default as its
 * named component plus that file's named exports/types. Deep imports
 * (`@/components/ui/button`) keep working — this is purely additive.
 *
 * NOTE: `feed-label-pill` and `feedback-modal` are app-coupled (they import
 * app-private context/atproto helpers) and are NOT part of the portable
 * generic surface — consuming apps should keep their own copies. They are
 * re-exported here only for certified-app's own ergonomics.
 */

export { default as AppDialog } from "./app-dialog";
export * from "./app-dialog";

export { default as Avatar } from "./avatar";
export * from "./avatar";

export { default as Badge } from "./badge";
export * from "./badge";

export { default as Banner } from "./banner";
export * from "./banner";

export { default as BottomSheet } from "./bottom-sheet";
export * from "./bottom-sheet";

export { default as Brandmark } from "./brandmark";
export * from "./brandmark";

export { default as Button } from "./button";
export * from "./button";

export { default as Card } from "./card";
export * from "./card";

export { default as CertIcon } from "./cert-icon";
export * from "./cert-icon";

export { default as Checkbox } from "./checkbox";
export * from "./checkbox";

export { default as Combobox } from "./combobox";
export * from "./combobox";

export { default as ConfirmDialog } from "./confirm-dialog";
export * from "./confirm-dialog";

export { default as DeleteRecordDialog } from "./delete-record-dialog";
export * from "./delete-record-dialog";

export { default as Drawer } from "./drawer";
export * from "./drawer";

export { default as EditBanner } from "./edit-banner";
export * from "./edit-banner";

export { default as EmptyState } from "./empty-state";
export * from "./empty-state";

export { default as ErrorBoundaryFallback } from "./error-boundary-fallback";
export * from "./error-boundary-fallback";

export { default as ErrorMessage } from "./error-message";
export * from "./error-message";

/* app-coupled — see note above */
export { default as FeedbackModal } from "./feedback-modal";
export * from "./feedback-modal";

/* app-coupled — see note above */
export { default as FeedLabelPill } from "./feed-label-pill";
export * from "./feed-label-pill";

export { default as FormDialog } from "./form-dialog";
export * from "./form-dialog";

export { default as IdentityRow } from "./identity-row";
export * from "./identity-row";

export { default as Input } from "./input";
export * from "./input";

export { default as LoadingSpinner } from "./loading-spinner";
export * from "./loading-spinner";

export { default as LoadMoreSentinel } from "./load-more-sentinel";
export * from "./load-more-sentinel";

export { default as Pagination } from "./pagination";
export * from "./pagination";

export { default as Popover } from "./popover";
export * from "./popover";

export { default as ProviderRedirectOverlay } from "./provider-redirect-overlay";
export * from "./provider-redirect-overlay";

export { default as RadioGroup } from "./radio";
export * from "./radio";

export { default as ResponsiveDialog } from "./responsive-dialog";
export * from "./responsive-dialog";

export { default as SegmentedControl } from "./segmented-control";
export * from "./segmented-control";

export { default as Select } from "./select";
export * from "./select";

export { default as SignInModal } from "./sign-in-modal";
export * from "./sign-in-modal";

export { default as Skeleton } from "./skeleton";
export * from "./skeleton";

export { default as SmartLink } from "./smart-link";
export * from "./smart-link";

export { default as Switch } from "./switch";
export * from "./switch";

export { default as Tabs } from "./tabs";
export * from "./tabs";

export { default as Textarea } from "./textarea";
export * from "./textarea";

export { default as ThemeToggle } from "./theme-toggle";
export * from "./theme-toggle";

export { default as ToastProvider } from "./toast";
export * from "./toast";
