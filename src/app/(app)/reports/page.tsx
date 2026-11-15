import { redirect } from 'next/navigation';

// "Report filter" was removed from the menu (Sprint 4). Old links go to the dashboard.
export default function Page() {
  redirect('/');
}
