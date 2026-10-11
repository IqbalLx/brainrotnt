// Programming problems for the starter bank. They go through the same verification as anything an agent
// submits: every reference passes its tests, every wrong solution fails at least one, no starter is solved.
const tools = { calculator: "none", draw: false };

export const CODE_SEEDS = [
  {
    id: "code-loops-001",
    subject: "code",
    topic: "loops",
    difficulty: 1,
    type: "code",
    tools,
    statement:
      "Write solve(numbers) that takes a list of integers and returns the sum of the even ones. For example solve([1, 2, 3, 4]) is 6, and an empty list gives 0.",
    answer: {
      entry: "solve",
      tests: [
        { args: [[1, 2, 3, 4]], expected: 6 },
        { args: [[]], expected: 0 },
        { args: [[7, 9]], expected: 0, hidden: true },
        { args: [[-2, 5, 10]], expected: 8, hidden: true },
        { args: [[0, 0, 4]], expected: 4, hidden: true },
      ],
    },
    languages: {
      python: {
        starter: "def solve(numbers):\n    # return the sum of the even numbers\n    return None\n",
        reference: "def solve(numbers):\n    return sum(n for n in numbers if n % 2 == 0)\n",
        wrong: "def solve(numbers):\n    return sum(n for n in numbers if n % 2 == 0 and n > 0)\n",
      },
      javascript: {
        starter: "function solve(numbers) {\n  // return the sum of the even numbers\n}\n",
        reference: "function solve(numbers) {\n  return numbers.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0);\n}\n",
        wrong: "function solve(numbers) {\n  return numbers.filter((n) => n % 2 === 0 && n > 0).reduce((a, b) => a + b, 0);\n}\n",
      },
    },
  },
  {
    id: "code-strings-001",
    subject: "code",
    topic: "strings",
    difficulty: 2,
    type: "code",
    tools,
    statement:
      "Write solve(text) that returns true if the text reads the same forwards and backwards when you ignore upper and lower case and every character that is not a letter or digit, and false otherwise. For example solve(\"A man, a plan, a canal: Panama\") is true and solve(\"hello\") is false. The empty string counts as a palindrome.",
    answer: {
      entry: "solve",
      tests: [
        { args: ["A man, a plan, a canal: Panama"], expected: true },
        { args: ["hello"], expected: false },
        { args: [""], expected: true, hidden: true },
        { args: ["No lemon, no melon"], expected: true, hidden: true },
        { args: ["ab"], expected: false, hidden: true },
        { args: ["12321"], expected: true, hidden: true },
        { args: ["0P"], expected: false, hidden: true },
      ],
    },
    languages: {
      python: {
        starter: "def solve(text):\n    # return True or False\n    return None\n",
        reference: "def solve(text):\n    letters = [c.lower() for c in text if c.isalnum()]\n    return letters == letters[::-1]\n",
        wrong: "def solve(text):\n    return text.lower() == text.lower()[::-1]\n",
      },
      javascript: {
        starter: "function solve(text) {\n  // return true or false\n}\n",
        reference: "function solve(text) {\n  const letters = [...text].filter((c) => /[a-z0-9]/i.test(c)).map((c) => c.toLowerCase());\n  return letters.join('') === letters.reverse().join('');\n}\n",
        wrong: "function solve(text) {\n  const lower = text.toLowerCase();\n  return lower === [...lower].reverse().join('');\n}\n",
      },
    },
  },
  {
    id: "code-arrays-001",
    subject: "code",
    topic: "arrays",
    difficulty: 2,
    type: "code",
    tools,
    statement:
      "Write solve(numbers) that returns the second largest distinct value in a list of integers, or null if the list has fewer than two distinct values. For example solve([4, 9, 9, 1]) is 4, and solve([5, 5]) is null.",
    answer: {
      entry: "solve",
      tests: [
        { args: [[4, 9, 9, 1]], expected: 4 },
        { args: [[5, 5]], expected: null },
        { args: [[]], expected: null, hidden: true },
        { args: [[1, 2]], expected: 1, hidden: true },
        { args: [[-3, -1, -2]], expected: -2, hidden: true },
        { args: [[10, 10, 10, 3]], expected: 3, hidden: true },
      ],
    },
    languages: {
      python: {
        starter: "def solve(numbers):\n    # return the second largest distinct value, or None\n    return None\n",
        reference: "def solve(numbers):\n    distinct = sorted(set(numbers))\n    return distinct[-2] if len(distinct) >= 2 else None\n",
        wrong: "def solve(numbers):\n    ordered = sorted(numbers)\n    return ordered[-2] if len(ordered) >= 2 else None\n",
      },
      javascript: {
        starter: "function solve(numbers) {\n  // return the second largest distinct value, or null\n}\n",
        reference: "function solve(numbers) {\n  const distinct = [...new Set(numbers)].sort((a, b) => a - b);\n  return distinct.length >= 2 ? distinct[distinct.length - 2] : null;\n}\n",
        wrong: "function solve(numbers) {\n  const ordered = [...numbers].sort((a, b) => a - b);\n  return ordered.length >= 2 ? ordered[ordered.length - 2] : null;\n}\n",
      },
    },
  },
  {
    id: "code-algorithms-001",
    subject: "code",
    topic: "algorithms",
    difficulty: 3,
    type: "code",
    tools,
    statement:
      "Write solve(n) that returns the first n numbers of the Fibonacci sequence as a list, starting 0, 1, 1, 2, 3, 5. For example solve(6) is [0, 1, 1, 2, 3, 5]. solve(0) is an empty list.",
    answer: {
      entry: "solve",
      tests: [
        { args: [6], expected: [0, 1, 1, 2, 3, 5] },
        { args: [0], expected: [] },
        { args: [1], expected: [0], hidden: true },
        { args: [2], expected: [0, 1], hidden: true },
        { args: [10], expected: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34], hidden: true },
        { args: [30], expected: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, 46368, 75025, 121393, 196418, 317811, 514229], hidden: true },
      ],
    },
    languages: {
      python: {
        starter: "def solve(n):\n    # return the first n Fibonacci numbers as a list\n    return None\n",
        reference: "def solve(n):\n    out, a, b = [], 0, 1\n    for _ in range(n):\n        out.append(a)\n        a, b = b, a + b\n    return out\n",
        wrong: "def solve(n):\n    out, a, b = [], 0, 1\n    for _ in range(n):\n        out.append(a)\n        a, b = b, a + b\n    return out[:9]\n",
      },
      javascript: {
        starter: "function solve(n) {\n  // return the first n Fibonacci numbers as an array\n}\n",
        reference: "function solve(n) {\n  const out = [];\n  let a = 0, b = 1;\n  for (let i = 0; i < n; i++) {\n    out.push(a);\n    [a, b] = [b, a + b];\n  }\n  return out;\n}\n",
        wrong: "function solve(n) {\n  const out = [];\n  let a = 0, b = 1;\n  for (let i = 0; i < n; i++) {\n    out.push(a);\n    [a, b] = [b, a + b];\n  }\n  return out.slice(0, 9);\n}\n",
      },
    },
  },
];
