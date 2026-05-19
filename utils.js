const BASE_PATH = "files";

const secondsToMinutes = (time = 0) => {
  if (Number.isNaN(time) || !Number.isFinite(time)) {
    return "00:00";
  }

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const path = (file = "") => {
  return `${BASE_PATH}/${file}`;
};

export { path, secondsToMinutes };
