import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Empty } from "../components/ui";

export default function NotFound() {
  return (
    <div className="page">
      <Empty icon={<Compass size={20} />} title="This page doesn't exist" action={<Link className="btn btn-primary" to="/">Back to Today</Link>}>
        The link may be old, or the item was deleted.
      </Empty>
    </div>
  );
}
