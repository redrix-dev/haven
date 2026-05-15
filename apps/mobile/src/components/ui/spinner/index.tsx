'use client';
import { ActivityIndicator } from 'react-native';
import React from 'react';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import { withUniwind } from 'uniwind';

const StyledActivityIndicator = withUniwind(ActivityIndicator);
const spinnerStyle = tva({});

export type SpinnerProps = Omit<
  React.ComponentProps<typeof ActivityIndicator>,
  'color' | 'colorClassName'
> & {
  /** UniWind: use `accent-*` prefix (https://docs.uniwind.dev/components/activity-indicator). */
  colorClassName?: `accent-${string}`;
  /**
   * @deprecated Pass `colorClassName="accent-…"` instead (UniWind).
   */
  color?: string;
};

const Spinner = React.forwardRef<React.ComponentRef<typeof ActivityIndicator>, SpinnerProps>(
  function Spinner(
    {
      className,
      colorClassName = 'accent-foreground',
      color: legacyColor,
      focusable = false,
      'aria-label': ariaLabel = 'loading',
      ...props
    },
    ref,
  ) {
    if (__DEV__ && legacyColor != null) {
      // eslint-disable-next-line no-console -- intentional migration nudge
      console.warn(
        '[Spinner] `color` is deprecated; use `colorClassName` with an `accent-*` utility per UniWind docs.',
      );
    }

    return (
      <StyledActivityIndicator
        ref={ref}
        focusable={focusable}
        aria-label={ariaLabel}
        {...props}
        colorClassName={colorClassName}
        className={spinnerStyle({ class: className })}
      />
    );
  },
);

Spinner.displayName = 'Spinner';

export { Spinner };
