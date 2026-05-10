'use client';

import { useState, ReactNode } from 'react';

interface DashboardWrapperProps {
  children: ReactNode;
}

export function DashboardWrapper({ children }: Readonly<DashboardWrapperProps>) {
  const [isMasked] = useState(false);

  return (
    <div data-masked={isMasked}>
      {children}
    </div>
  );
}
