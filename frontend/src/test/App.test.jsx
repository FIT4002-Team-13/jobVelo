import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders the Smart Recruit heading", () => {
  render(<App />);
  expect(screen.getByText("Smart Recruit")).toBeInTheDocument();
});

test("renders the subtitle", () => {
  render(<App />);
  expect(
    screen.getByText("Real-Time Interview Intelligence System")
  ).toBeInTheDocument();
});
