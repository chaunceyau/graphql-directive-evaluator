export function runAndEvaluateFunctionPerformance(fn: Function) {
  const start = Bun.nanoseconds();
  const value = fn();
  const end = Bun.nanoseconds();
  const timeNanoseconds = end - start;
  console.log(
    fn.name +
      " performance time, ns: " +
      timeNanoseconds +
      "; ms: " +
      timeNanoseconds / 1000000
  );
  return { value, timeMs: timeNanoseconds / 1000000 };
}
