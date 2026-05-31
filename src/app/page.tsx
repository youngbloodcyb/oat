import Image from "next/image";
import { Board } from "./board";

export default function Home() {
  return (
    <div className="flex items-center justify-center">
      <Board />
    </div>
  );
}
