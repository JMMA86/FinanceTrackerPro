import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect root to dashboard (now in route group)
  redirect('/dashboard');
}
