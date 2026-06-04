import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import { button, modal, page } from '../styles/layout'
import commentIcon from '../assets/icons/comment.png'
import StatDelta from '../components/common/StatDelta';

export default function Profile() {
  const { user } = useAuth();

  if (!user) return <div>Loading...</div>;


  return (
    <div className="flex min-h-screen bg-neutral-50">

      <Sidebar user={user} />


    </div>
  );
}