/*
 * tree.math.js — the Mathematics tree.
 *
 * Twenty-two skills from arithmetic to calculus. Mathematics grades itself
 * better than anything else in this app: the answers are exact, so the numeric
 * grader (domain/verify.js) checks them with no model in the loop and no
 * self-reporting.
 *
 * Two deliberate choices in the question sets:
 *
 *   - Answers are accepted in the forms people actually type. 0.5, 1/2 and 50%
 *     all parse, so the exercise is the mathematics rather than the input box.
 *   - Several questions target a specific known misconception rather than
 *     testing whether the procedure was executed. Asking for (-3)² and -3²
 *     separately finds out something that "compute 4²" never will.
 */

const n = (prompt, answer, explain, tolerance) => ({ prompt, answer, explain, tolerance });

export const MATH_TREE = {
  id: 'math',
  name: 'Mathematics',
  tagline: 'Arithmetic to calculus, in the order the ideas actually need each other.',
  category: 'Mathematics',
  icon: 'sigma',
  skills: [
    {
      id: 'arithmetic',
      name: 'Arithmetic',
      category: 'Number',
      difficulty: 1,
      estimatedHours: [2, 4],
      requires: [],
      description: 'The four operations, order of operations, and negative numbers.',
      why: 'Every later topic assumes this is automatic. Where algebra goes wrong is usually arithmetic, not algebra.',
      activities: [
        {
          id: 'arithmetic.learn',
          kind: 'learn',
          title: 'Order of operations',
          body: [
            'Operations have a fixed precedence: brackets first, then exponents, then multiplication and division left to right, then addition and subtraction left to right. "Left to right" matters — 8 ÷ 4 × 2 is 4, not 1, because division and multiplication are equal in rank and evaluated in order.',
            'The minus sign has two jobs and confusing them is the most common arithmetic error there is. In -3², the exponent binds tighter than the negation, so it means -(3²) = -9. In (-3)², the bracket makes the negative part of the base, giving 9.',
            'Subtracting a negative adds: 5 - (-3) = 8. Two negatives multiplied give a positive; a negative to an even power is positive, to an odd power negative.',
          ],
        },
        {
          id: 'arithmetic.practice',
          kind: 'practice',
          title: 'Order of operations',
          questions: [
            n('Compute: 8 ÷ 4 × 2', 4, 'Division and multiplication are equal rank, so work left to right: 8÷4 = 2, then 2×2 = 4.'),
            n('Compute: -3²', -9, 'The exponent binds before the negation, so this is -(3²) = -9.'),
            n('Compute: (-3)²', 9, 'The bracket makes -3 the base, and a negative squared is positive.'),
            n('Compute: 5 - (-3)', 8, 'Subtracting a negative adds.'),
            n('Compute: 2 + 3 × 4²', 50, 'Exponent first (16), then multiply (48), then add: 50.'),
          ],
        },
      ],
    },

    {
      id: 'fractions',
      name: 'Fractions',
      category: 'Number',
      difficulty: 2,
      estimatedHours: [2, 4],
      requires: [{ skillId: 'arithmetic', minLevel: 2 }],
      description: 'Equivalence, common denominators, and the four operations on fractions.',
      why: 'Algebraic fractions follow exactly these rules. People who find algebra hard are often finding fractions hard.',
      activities: [
        {
          id: 'fractions.learn',
          kind: 'learn',
          title: 'Why adding needs a common denominator',
          body: [
            'A fraction is a division. 3/4 is three quarters — three copies of one-quarter. Multiplying top and bottom by the same number does not change the value, because it multiplies by 1 in disguise: 3/4 = 6/8.',
            'Adding requires the same denominator because you can only add like things. Three quarters plus two fifths is not five ninths for the same reason three apples plus two oranges is not five apples. Rewrite both over 20 and they become addable.',
            'Multiplying is the easy one: multiply across the top and across the bottom. Dividing is multiplying by the reciprocal — flip the second fraction and multiply. This works because dividing by 2/3 asks "how many two-thirds fit", and that is the same as multiplying by 3/2.',
          ],
        },
        {
          id: 'fractions.practice',
          kind: 'practice',
          title: 'Operating on fractions',
          questions: [
            n('3/4 + 2/5 = ? (decimal or fraction)', 1.15, 'Over 20: 15/20 + 8/20 = 23/20 = 1.15.'),
            n('2/3 × 3/8 = ?', 0.25, 'Multiply across: 6/24, which cancels to 1/4.'),
            n('(3/4) ÷ (2/3) = ?', 1.125, 'Multiply by the reciprocal: 3/4 × 3/2 = 9/8 = 1.125.'),
            n('What is 5/8 as a decimal?', 0.625, '5 ÷ 8 = 0.625.'),
          ],
        },
      ],
    },

    {
      id: 'percentages',
      name: 'Percentages',
      category: 'Number',
      difficulty: 2,
      estimatedHours: [1, 3],
      requires: [{ skillId: 'fractions', minLevel: 2 }],
      description: 'Percentage of, percentage change, and why a rise then a fall does not return you home.',
      why: 'The most-used mathematics in ordinary life, and the most commonly got wrong in public argument.',
      activities: [
        {
          id: 'percentages.learn',
          kind: 'learn',
          title: 'Multipliers beat formulas',
          body: [
            'Per cent means per hundred, so 15% is the multiplier 0.15. Increasing by 15% multiplies by 1.15; decreasing by 15% multiplies by 0.85. Thinking in multipliers replaces a stack of formulas with one idea.',
            'This makes the classic trap obvious. Up 20% then down 20% is ×1.2 then ×0.8 = ×0.96 — you are down 4%, because the two percentages are taken of different bases.',
            'Percentage change is (new − old) ÷ old, and the denominator is always the starting value. Going from 40 to 50 is a 25% rise; going from 50 to 40 is a 20% fall. The same gap, different percentages, because the base changed.',
            'A rise from 2% to 4% is a rise of two percentage points and an increase of 100%. Both are true and they are different claims — which is exactly why the distinction gets exploited.',
          ],
        },
        {
          id: 'percentages.practice',
          kind: 'practice',
          title: 'Percentage change',
          questions: [
            n('A price rises 20%, then falls 20%. What fraction of the original is it now?', 0.96, '1.2 × 0.8 = 0.96 — down 4%, because the fall is taken of the higher price.'),
            n('From 40 to 50 is what percentage increase?', 25, '(50-40)/40 = 0.25 = 25%.', 0.01),
            n('From 50 to 40 is what percentage decrease?', 20, '(50-40)/50 = 0.20 = 20%. Same gap, smaller percentage, because the base is larger.', 0.01),
            n('A rate goes from 2% to 4%. By what percentage did it increase?', 100, 'It doubled — a 100% increase, and a rise of 2 percentage points.', 0.01),
          ],
        },
      ],
    },

    {
      id: 'powers_roots',
      name: 'Powers & Roots',
      category: 'Number',
      difficulty: 2,
      estimatedHours: [2, 4],
      requires: [{ skillId: 'arithmetic', minLevel: 3 }],
      description: 'Index laws, negative and fractional exponents, and square roots.',
      why: 'Index laws are the machinery behind exponentials, logarithms and most of calculus notation.',
      activities: [
        {
          id: 'powers_roots.learn',
          kind: 'learn',
          title: 'The index laws, and why they are forced',
          body: [
            'Multiplying powers of the same base adds the exponents: 2³ × 2⁴ = 2⁷, because it is three twos times four twos. Dividing subtracts. A power of a power multiplies: (2³)² = 2⁶.',
            'Everything else follows from insisting those rules keep working. 2³ ÷ 2³ must be 2⁰, and it is obviously 1, so x⁰ = 1 for any non-zero x. Continue downward and 2⁻¹ must be 1/2: a negative exponent is a reciprocal.',
            'Fractional exponents come from the same insistence. x^(1/2) squared is x^1 = x, so x^(1/2) is the square root. That is why roots and powers are the same notation.',
          ],
        },
        {
          id: 'powers_roots.practice',
          kind: 'practice',
          title: 'Index laws',
          questions: [
            n('2³ × 2⁴ = ?', 128, 'Add the exponents: 2⁷ = 128.'),
            n('What is 5⁰?', 1, 'Anything non-zero to the power 0 is 1 — forced by x³÷x³ = x⁰ = 1.'),
            n('What is 4^(1/2)?', 2, 'A half-power is a square root.'),
            n('What is 2⁻³?', 0.125, 'A negative exponent is a reciprocal: 1/2³ = 1/8.'),
            n('What is 27^(1/3)?', 3, 'A third-power is a cube root, and 3³ = 27.'),
          ],
        },
      ],
    },

    {
      id: 'basic_algebra',
      name: 'Basic Algebra',
      category: 'Algebra',
      difficulty: 2,
      estimatedHours: [3, 6],
      requires: [
        { skillId: 'fractions', minLevel: 3 },
        { skillId: 'powers_roots', minLevel: 2 },
      ],
      description: 'Variables, expressions, collecting terms and expanding brackets.',
      why: 'Algebra is arithmetic with the numbers hidden. Every rule is one you already use.',
      activities: [
        {
          id: 'basic_algebra.learn',
          kind: 'learn',
          title: 'Letters are just numbers you have not been told',
          body: [
            'A variable stands for a number. Every rule of arithmetic still applies, which is the whole point: 3x + 2x = 5x for the same reason three apples plus two apples is five.',
            'Only like terms collect. 3x + 2x² does not simplify, because x and x² are different quantities — one scales with the side of a square, the other with its area.',
            'Expanding brackets distributes: a(b + c) = ab + ac. The error to watch is the sign on a subtraction: -(x - 3) is -x + 3, not -x - 3. The minus applies to every term inside.',
            'Factorising is expanding read backwards, and it is the more useful direction: a factorised expression tells you when it equals zero, which is how equations get solved.',
          ],
        },
        {
          id: 'basic_algebra.practice',
          kind: 'practice',
          title: 'Expanding and collecting',
          questions: [
            n('Expand and simplify 3(x + 4) − 2(x − 1). Coefficient of x?', 1, '3x + 12 − 2x + 2 = x + 14. The coefficient is 1.'),
            n('Expand and simplify 3(x + 4) − 2(x − 1). Constant term?', 14, 'The minus applies to both terms: −2(x−1) = −2x + 2. So 12 + 2 = 14.'),
            n('If x = 3, what is 2x² − 5x + 1?', 4, '2(9) − 15 + 1 = 18 − 15 + 1 = 4.'),
            n('Expand (x + 3)(x + 5). What is the coefficient of x?', 8, 'x² + 5x + 3x + 15, so the x coefficient is 8.'),
          ],
        },
      ],
    },

    {
      id: 'equations',
      name: 'Equations',
      category: 'Algebra',
      difficulty: 3,
      estimatedHours: [3, 5],
      requires: [{ skillId: 'basic_algebra', minLevel: 3 }],
      description: 'Solving linear equations, rearranging formulas and checking answers.',
      why: 'Solving for an unknown is the single most transferable technique in mathematics.',
      activities: [
        {
          id: 'equations.learn',
          kind: 'learn',
          title: 'Balance, and what breaks it',
          body: [
            'An equation is a claim that two expressions are equal. Do the same thing to both sides and the claim stays true. That is the only rule, applied repeatedly, until the unknown is alone.',
            'Two operations are not fully reversible and cause most lost or false solutions. Dividing by an expression that could be zero loses a solution — from x² = 3x, dividing by x gives x = 3 and silently drops x = 0. Move everything to one side and factorise instead.',
            'Squaring both sides can invent solutions that do not satisfy the original. Any time you square, check your answers back in the original equation.',
            'Checking is not optional politeness; substituting back is a complete verification and it takes ten seconds.',
          ],
        },
        {
          id: 'equations.practice',
          kind: 'practice',
          title: 'Solving',
          questions: [
            n('Solve 3x + 7 = 22', 5, 'Subtract 7 (3x = 15), divide by 3.'),
            n('Solve 5(x − 2) = 3x + 4', 7, '5x − 10 = 3x + 4, so 2x = 14, x = 7.'),
            n('x² = 3x has two solutions. What is the smaller one?', 0, 'Factorise: x(x − 3) = 0, so x = 0 or x = 3. Dividing by x would have lost the zero.'),
            n('Solve (x + 1)/4 = 3', 11, 'Multiply both sides by 4, then subtract 1.'),
          ],
        },
      ],
    },

    {
      id: 'inequalities',
      name: 'Inequalities',
      category: 'Algebra',
      difficulty: 3,
      estimatedHours: [2, 3],
      requires: [{ skillId: 'equations', minLevel: 3 }],
      description: 'Solving inequalities and the one rule that differs from equations.',
      why: 'Constraints, ranges and domains are all inequalities.',
      activities: [
        {
          id: 'inequalities.learn',
          kind: 'learn',
          title: 'The sign flip',
          body: [
            'Inequalities solve like equations with one exception: multiplying or dividing both sides by a negative number reverses the direction. −2x < 6 becomes x > −3.',
            'The reason is visible on a number line. −1 is greater than −5, but multiply both by −1 and you get 1 and 5, where the order has swapped. Negation reflects the line.',
            'The same caution applies to multiplying by a variable whose sign you do not know: you cannot, without splitting into cases, because you do not know whether to flip.',
          ],
        },
        {
          id: 'inequalities.practice',
          kind: 'practice',
          title: 'Solving inequalities',
          questions: [
            n('Solve −2x < 6. The boundary value of x is?', -3, 'Divide by −2 and flip: x > −3.'),
            n('Solve 3x − 4 ≥ 11. The smallest x that works?', 5, '3x ≥ 15, so x ≥ 5.'),
            n('Solve 10 − x > 4. The boundary value of x?', 6, '−x > −6, so x < 6.'),
          ],
        },
      ],
    },

    {
      id: 'coordinates',
      name: 'Coordinates',
      category: 'Geometry',
      difficulty: 2,
      estimatedHours: [2, 3],
      requires: [{ skillId: 'basic_algebra', minLevel: 2 }],
      description: 'The plane, distance, midpoint and gradient.',
      why: 'Coordinates are the bridge that lets algebra describe shapes and geometry describe equations.',
      activities: [
        {
          id: 'coordinates.learn',
          kind: 'learn',
          title: 'Algebra with a picture',
          body: [
            'A point is an ordered pair. Gradient is rise over run: (y₂ − y₁)/(x₂ − x₁) — how much the line climbs per step right. A negative gradient falls; a zero gradient is flat; a vertical line has no gradient at all, because the run is zero and you cannot divide by it.',
            'Distance is Pythagoras applied to the horizontal and vertical gaps: √((x₂−x₁)² + (y₂−y₁)²). Midpoint is the average of each coordinate, which is exactly what "middle" means.',
            'Perpendicular gradients multiply to −1. Parallel lines share a gradient.',
          ],
        },
        {
          id: 'coordinates.practice',
          kind: 'practice',
          title: 'Points and lines',
          questions: [
            n('Gradient of the line through (1, 2) and (4, 11)?', 3, '(11−2)/(4−1) = 9/3 = 3.'),
            n('Distance between (0, 0) and (3, 4)?', 5, '√(9 + 16) = 5.'),
            n('x-coordinate of the midpoint of (2, 5) and (8, 1)?', 5, 'Average the x values: (2+8)/2 = 5.'),
            n('A line perpendicular to gradient 2 has what gradient?', -0.5, 'Perpendicular gradients multiply to −1.'),
          ],
        },
      ],
    },

    {
      id: 'geometry',
      name: 'Geometry',
      category: 'Geometry',
      difficulty: 2,
      estimatedHours: [3, 5],
      requires: [{ skillId: 'arithmetic', minLevel: 3 }],
      description: 'Angles, area, perimeter and the properties of common shapes.',
      why: 'Spatial reasoning, and the setting where proof first becomes natural.',
      activities: [
        {
          id: 'geometry.learn',
          kind: 'learn',
          title: 'Angles and area',
          body: [
            'Angles on a straight line sum to 180°, around a point to 360°, and in any triangle to 180°. In a polygon with n sides the interior angles sum to (n − 2) × 180°, because it can be cut into n − 2 triangles.',
            'Area of a triangle is ½ × base × height, where the height is perpendicular to the base — not the slanted side. Circle area is πr², circumference 2πr.',
            'Scaling a shape by a factor k multiplies lengths by k, areas by k² and volumes by k³. This is why doubling a pizza\'s diameter quadruples the pizza.',
          ],
        },
        {
          id: 'geometry.practice',
          kind: 'practice',
          title: 'Angles and area',
          questions: [
            n('Two angles of a triangle are 45° and 65°. The third?', 70, 'Angles in a triangle sum to 180°.'),
            n('Interior angles of a hexagon sum to how many degrees?', 720, '(6 − 2) × 180 = 720.'),
            n('Area of a triangle with base 10 and perpendicular height 6?', 30, '½ × 10 × 6 = 30.'),
            n('A shape is scaled ×3. Its area is multiplied by?', 9, 'Areas scale with the square of the length factor.'),
          ],
        },
      ],
    },

    {
      id: 'functions',
      name: 'Functions',
      category: 'Functions',
      difficulty: 3,
      estimatedHours: [3, 6],
      requires: [
        { skillId: 'equations', minLevel: 3 },
        { skillId: 'coordinates', minLevel: 2 },
      ],
      description: 'Mapping inputs to outputs, notation, domain and composition.',
      why: 'Functions are the central object of all later mathematics — and of programming.',
      activities: [
        {
          id: 'functions.learn',
          kind: 'learn',
          title: 'One input, one output',
          body: [
            'A function assigns exactly one output to each input. That "exactly one" is the whole definition, and it is what the vertical line test checks on a graph: two outputs for one input means it is not a function.',
            'f(x) is not multiplication. It is the name of the output when the input is x. f(3) means substitute 3 everywhere x appears.',
            'The domain is the set of legal inputs. It shrinks wherever the rule breaks: division by zero, or the square root of a negative in the real numbers.',
            'Composition applies one function to the result of another. f(g(x)) means do g first — the inside one goes first, which is the reverse of the reading order and catches everyone out at least once.',
          ],
        },
        {
          id: 'functions.practice',
          kind: 'practice',
          title: 'Evaluating and composing',
          questions: [
            n('f(x) = 2x + 1. What is f(5)?', 11, 'Substitute: 2(5) + 1 = 11.'),
            n('f(x) = x², g(x) = x + 3. What is f(g(2))?', 25, 'Inside first: g(2) = 5, then f(5) = 25.'),
            n('f(x) = x², g(x) = x + 3. What is g(f(2))?', 7, 'f(2) = 4, then g(4) = 7. Order matters.'),
            n('f(x) = 1/(x − 2). Which x value is excluded from the domain?', 2, 'It would divide by zero.'),
          ],
        },
      ],
    },

    {
      id: 'linear_functions',
      name: 'Linear Functions',
      category: 'Functions',
      difficulty: 3,
      estimatedHours: [2, 4],
      requires: [{ skillId: 'functions', minLevel: 2 }],
      description: 'Straight lines, gradient-intercept form and simultaneous equations.',
      why: 'Constant rates of change model an enormous amount of the world, and they approximate the rest locally.',
      activities: [
        {
          id: 'linear_functions.learn',
          kind: 'learn',
          title: 'y = mx + c',
          body: [
            'Every straight line is y = mx + c: m is the gradient, c is where it crosses the y-axis. A linear function is exactly one with a constant rate of change.',
            'Two lines meet where they are equal. Setting the expressions equal and solving gives the x of the intersection; substituting back gives the y. That is what solving simultaneous equations means geometrically.',
            'Parallel lines share m and never meet — the algebra ends in a false statement like 0 = 5. Identical lines share both m and c and meet everywhere, and the algebra ends in 0 = 0. Both are worth recognising when they appear.',
          ],
        },
        {
          id: 'linear_functions.practice',
          kind: 'practice',
          title: 'Lines and intersections',
          questions: [
            n('Line through (0, 3) with gradient 2. What is y when x = 4?', 11, 'y = 2x + 3, so y = 11.'),
            n('Where do y = 2x + 1 and y = x + 4 meet? Give x.', 3, '2x + 1 = x + 4, so x = 3.'),
            n('And the y at that intersection?', 7, 'Substitute x = 3 into either: y = 7.'),
            n('What is the gradient of a line parallel to y = −3x + 2?', -3, 'Parallel lines have equal gradients.'),
          ],
        },
      ],
    },

    {
      id: 'quadratics',
      name: 'Quadratic Functions',
      category: 'Functions',
      difficulty: 4,
      estimatedHours: [4, 7],
      requires: [{ skillId: 'linear_functions', minLevel: 3 }],
      description: 'Parabolas, factorising, the quadratic formula and the discriminant.',
      why: 'The first genuinely non-linear behaviour, and the model for anything with a turning point.',
      activities: [
        {
          id: 'quadratics.learn',
          kind: 'learn',
          title: 'Roots, vertex and discriminant',
          body: [
            'A quadratic graphs as a parabola. Where it crosses the x-axis are the roots, and factorising finds them directly: (x − 2)(x − 3) = 0 is zero exactly when one factor is, giving x = 2 and x = 3.',
            'The quadratic formula solves any of them: x = (−b ± √(b² − 4ac)) / 2a. The part under the root, b² − 4ac, is the discriminant, and it tells you the shape of the answer before you compute it — positive means two real roots, zero means one repeated root sitting on the axis, negative means the parabola never touches it.',
            'The vertex sits at x = −b/2a, halfway between the roots by symmetry. It is the maximum if the parabola opens downward, the minimum if upward — which is the first optimisation problem most people meet.',
          ],
        },
        {
          id: 'quadratics.practice',
          kind: 'practice',
          title: 'Solving quadratics',
          questions: [
            n('x² − 5x + 6 = 0. The larger root?', 3, 'Factorises to (x−2)(x−3), so roots are 2 and 3.'),
            n('Discriminant of x² + 2x + 5?', -16, '4 − 20 = −16. Negative, so no real roots.'),
            n('How many real roots does x² + 2x + 5 have?', 0, 'A negative discriminant means the parabola never crosses the axis.'),
            n('x-coordinate of the vertex of y = x² − 6x + 5?', 3, '−b/2a = 6/2 = 3.'),
            n('Minimum value of y = x² − 6x + 5?', -4, 'At x = 3: 9 − 18 + 5 = −4.'),
          ],
        },
      ],
    },

    {
      id: 'sequences',
      name: 'Sequences',
      category: 'Algebra',
      difficulty: 3,
      estimatedHours: [2, 4],
      requires: [{ skillId: 'basic_algebra', minLevel: 3 }],
      description: 'Arithmetic and geometric sequences, nth terms and series.',
      why: 'Compound interest, population growth and algorithmic complexity are all sequences.',
      activities: [
        {
          id: 'sequences.learn',
          kind: 'learn',
          title: 'Adding versus multiplying',
          body: [
            'An arithmetic sequence adds a constant each step: nth term a + (n−1)d. A geometric sequence multiplies by a constant: nth term ar^(n−1). Which one you have decides everything that follows.',
            'The difference compounds dramatically. Adding 10 each step from 10 reaches 1,000 in a hundred steps. Multiplying by 2 each step from 10 passes a trillion in forty. This gap is why intuition about exponential growth is so unreliable.',
            'A geometric series with ratio between −1 and 1 converges: the terms shrink fast enough that infinitely many of them sum to a finite number, a/(1−r).',
          ],
        },
        {
          id: 'sequences.practice',
          kind: 'practice',
          title: 'Sequences',
          questions: [
            n('Arithmetic sequence 3, 7, 11, … What is the 10th term?', 39, 'a + (n−1)d = 3 + 9(4) = 39.'),
            n('Geometric sequence 2, 6, 18, … What is the 5th term?', 162, '2 × 3⁴ = 162.'),
            n('Sum to infinity of 8 + 4 + 2 + 1 + …', 16, 'a/(1−r) = 8/(1−0.5) = 16.'),
            n('Sum of the first 10 terms of 3, 7, 11, …?', 210, 'n/2 × (first + last) = 5 × (3 + 39) = 210.'),
          ],
        },
      ],
    },

    {
      id: 'statistics',
      name: 'Statistics',
      category: 'Data',
      difficulty: 3,
      estimatedHours: [3, 5],
      requires: [{ skillId: 'percentages', minLevel: 3 }],
      description: 'Averages, spread, and how summaries mislead.',
      why: 'You are shown statistics daily. Knowing what a summary hides is a defensive skill.',
      activities: [
        {
          id: 'statistics.learn',
          kind: 'learn',
          title: 'What an average hides',
          body: [
            'The mean is the total shared equally. The median is the middle value. The mode is the most common. They answer different questions and diverge exactly when the data is skewed — which is when it matters.',
            'Income is the standard example. A handful of very large values drags the mean far above the median, so "average income" can rise while most people earn less than before. Neither number is wrong; reporting only one is.',
            'Spread matters as much as centre. Two datasets can share a mean and be nothing alike — standard deviation says how far from the centre a typical value sits.',
            'Correlation is not causation, and the reason is usually a confounder: ice cream sales and drownings rise together because both follow the weather.',
          ],
        },
        {
          id: 'statistics.practice',
          kind: 'practice',
          title: 'Summarising data',
          questions: [
            n('Mean of 4, 8, 6, 2?', 5, '20 ÷ 4 = 5.'),
            n('Median of 1, 3, 3, 7, 9?', 3, 'The middle value of five sorted values is the third.'),
            n('Salaries: 20, 22, 24, 26, 200 (thousands). What is the median?', 24, 'The middle value, unmoved by the outlier.'),
            n('And the mean of those salaries?', 58.4, '292 ÷ 5 = 58.4 — above every value but one, which is the point.'),
          ],
        },
      ],
    },

    {
      id: 'probability',
      name: 'Probability',
      category: 'Data',
      difficulty: 3,
      estimatedHours: [3, 6],
      requires: [
        { skillId: 'fractions', minLevel: 3 },
        { skillId: 'statistics', minLevel: 2 },
      ],
      description: 'Chance, independence, conditional probability and expected value.',
      why: 'Reasoning under uncertainty, and the mathematics most often got wrong by intelligent people.',
      activities: [
        {
          id: 'probability.learn',
          kind: 'learn',
          title: 'Independence and conditioning',
          body: [
            'Probability runs from 0 to 1. For independent events, multiply: two fair coins both landing heads is ½ × ½ = ¼. Independence means one outcome tells you nothing about the other — and assuming it when it is false is the error behind more than one financial crisis.',
            'The gambler\'s fallacy is the belief that a coin is "due". A fair coin has no memory; after nine heads, the tenth is still ½.',
            'Conditional probability updates on evidence, and human intuition is badly calibrated here. A test that is 99% accurate for a disease affecting 1 in 10,000 still produces about a hundred false positives for every true one, simply because there are so many more healthy people to test.',
            'Expected value is the long-run average: sum of each outcome times its probability. It is the right basis for repeated decisions and a poor one for irreversible single bets.',
          ],
        },
        {
          id: 'probability.practice',
          kind: 'practice',
          title: 'Computing probabilities',
          questions: [
            n('Probability of two heads in two fair coin flips?', 0.25, 'Independent events multiply: ½ × ½.'),
            n('Nine heads in a row. Probability the tenth is heads?', 0.5, 'The coin has no memory. Past flips do not change it.'),
            n('One die. Probability of rolling more than 4?', 0.3333, 'Two outcomes out of six.', 0.005),
            n('Win £10 with probability 0.3, lose £5 otherwise. Expected value?', -0.5, '0.3(10) + 0.7(−5) = 3 − 3.5 = −0.5.'),
          ],
        },
      ],
    },

    {
      id: 'trigonometry',
      name: 'Trigonometry',
      category: 'Geometry',
      difficulty: 4,
      estimatedHours: [4, 7],
      requires: [
        { skillId: 'geometry', minLevel: 3 },
        { skillId: 'functions', minLevel: 2 },
      ],
      description: 'Sine, cosine, tangent, the unit circle and radians.',
      why: 'Anything that rotates, oscillates or repeats is described with these.',
      activities: [
        {
          id: 'trigonometry.learn',
          kind: 'learn',
          title: 'From triangles to circles',
          body: [
            'In a right-angled triangle: sine is opposite over hypotenuse, cosine adjacent over hypotenuse, tangent opposite over adjacent. Because they are ratios, they depend only on the angle, not the size of the triangle — which is what makes them useful.',
            'The unit circle generalises them beyond 90°. A point at angle θ on a circle of radius 1 has coordinates (cos θ, sin θ). Suddenly the functions are defined for every angle, they repeat every full turn, and sin² + cos² = 1 is just Pythagoras.',
            'Radians measure angle by arc length: a full turn is 2π, a right angle is π/2. They are not an alternative notation for degrees — calculus requires them, because the derivative of sin x is cos x only in radians.',
          ],
        },
        {
          id: 'trigonometry.practice',
          kind: 'practice',
          title: 'Trig values',
          questions: [
            n('sin(30°) = ?', 0.5, 'One of the standard values, from the half-equilateral triangle.'),
            n('cos(60°) = ?', 0.5, 'Equal to sin(30°) — the two are complementary.'),
            n('Right triangle, opposite 3, hypotenuse 5. sin of that angle?', 0.6, 'Opposite over hypotenuse.'),
            n('A right angle in radians?', 1.5708, 'π/2 ≈ 1.5708.', 0.001),
            n('sin²θ + cos²θ = ?', 1, 'Pythagoras on the unit circle.'),
          ],
        },
      ],
    },

    {
      id: 'exponentials_logs',
      name: 'Exponentials & Logs',
      category: 'Functions',
      difficulty: 4,
      estimatedHours: [3, 6],
      requires: [
        { skillId: 'powers_roots', minLevel: 3 },
        { skillId: 'functions', minLevel: 3 },
      ],
      description: 'Growth, decay, and logarithms as the inverse of exponentiation.',
      why: 'Compound interest, half-lives, pH, decibels and algorithmic complexity all live here.',
      activities: [
        {
          id: 'exponentials_logs.learn',
          kind: 'learn',
          title: 'Logs are exponents',
          body: [
            'An exponential function has the variable in the exponent: 2^x, not x². It grows by a constant factor per step rather than a constant amount, which is why it eventually outruns any polynomial.',
            'A logarithm answers "what exponent gives this?" — log₂(8) = 3 because 2³ = 8. That is the entire definition, and every log rule follows from an index law: log(ab) = log a + log b is just the rule that multiplying adds exponents, read backwards.',
            'That turning of multiplication into addition is why logs are everywhere. It is what a log scale does, and it is why a doubling time is constant for exponential growth.',
          ],
        },
        {
          id: 'exponentials_logs.practice',
          kind: 'practice',
          title: 'Logs and growth',
          questions: [
            n('log₂(8) = ?', 3, '2³ = 8.'),
            n('log₁₀(1000) = ?', 3, '10³ = 1000.'),
            n('If log(a) = 2 and log(b) = 3, what is log(ab)?', 5, 'Multiplying inside a log adds the logs.'),
            n('£100 at 10% compound. Value after 2 years?', 121, '100 × 1.1² = 121.'),
          ],
        },
      ],
    },

    {
      id: 'precalculus',
      name: 'Pre-Calculus',
      category: 'Analysis',
      difficulty: 4,
      estimatedHours: [4, 8],
      requires: [
        { skillId: 'quadratics', minLevel: 3 },
        { skillId: 'trigonometry', minLevel: 2 },
        { skillId: 'exponentials_logs', minLevel: 2 },
      ],
      description: 'Limits, continuity, and rates of change approached informally.',
      why: 'The bridge. Calculus without the limit concept is a set of rules you cannot debug.',
      activities: [
        {
          id: 'precalculus.learn',
          kind: 'learn',
          title: 'Approaching without arriving',
          body: [
            'A limit describes where a function is heading as the input approaches a value — regardless of what happens exactly there. (x² − 1)/(x − 1) is undefined at x = 1, but everywhere nearby it equals x + 1, so the limit is 2. The hole in the graph does not affect the approach.',
            'That distinction is the whole idea, and it is what makes the derivative possible: average rate of change over an interval is easy, and instantaneous rate is the limit as the interval shrinks to nothing.',
            'A function is continuous where you can draw it without lifting the pen — the limit exists and equals the value. Continuity is what most calculus theorems quietly assume.',
          ],
        },
        {
          id: 'precalculus.practice',
          kind: 'practice',
          title: 'Limits',
          questions: [
            n('Limit of (x² − 1)/(x − 1) as x → 1?', 2, 'Factor to (x+1)(x−1)/(x−1) = x + 1, which approaches 2.'),
            n('Limit of (3x + 2) as x → 2?', 8, 'Continuous, so substitute directly.'),
            n('Average rate of change of x² from x = 1 to x = 3?', 4, '(9 − 1)/(3 − 1) = 4.'),
            n('Limit of 1/x as x → ∞?', 0, 'The value shrinks without bound toward zero.'),
          ],
        },
      ],
    },

    {
      id: 'derivatives',
      name: 'Derivatives',
      category: 'Analysis',
      difficulty: 5,
      estimatedHours: [5, 10],
      requires: [{ skillId: 'precalculus', minLevel: 3 }],
      description: 'Instantaneous rate of change, the power rule, and optimisation.',
      why: 'Rates of change describe motion, growth, cost, and every optimisation problem.',
      activities: [
        {
          id: 'derivatives.learn',
          kind: 'learn',
          title: 'The slope at a point',
          body: [
            'The derivative is the gradient of the tangent — the instantaneous rate of change. It is defined as the limit of the average rate over an interval as that interval shrinks to zero.',
            'The power rule does most of the work: d/dx of xⁿ is n·x^(n−1). Constants differentiate to zero, because a constant does not change. Sums differentiate term by term.',
            'Where the derivative is zero, the function is momentarily flat — a maximum, a minimum, or a point of inflection. This is why optimisation reduces to solving f\'(x) = 0, which is the single most applied idea in all of calculus.',
            'The second derivative tells you which kind: negative means the curve bends downward and you are at a maximum, positive means a minimum.',
          ],
        },
        {
          id: 'derivatives.practice',
          kind: 'practice',
          title: 'Differentiating',
          questions: [
            n('f(x) = x³. What is f\'(2)?', 12, '3x², so 3(4) = 12.'),
            n('f(x) = 5x² + 3x − 7. What is f\'(x) at x = 1?', 13, '10x + 3 = 13 at x = 1.'),
            n('f(x) = x² − 6x + 5. At what x is the derivative zero?', 3, '2x − 6 = 0, so x = 3 — the vertex, as found earlier by symmetry.'),
            n('Derivative of a constant, say f(x) = 7?', 0, 'It never changes, so its rate of change is zero.'),
          ],
        },
      ],
    },

    {
      id: 'integrals',
      name: 'Integration',
      category: 'Analysis',
      difficulty: 5,
      estimatedHours: [5, 10],
      requires: [{ skillId: 'derivatives', minLevel: 3 }],
      description: 'Accumulation, area under a curve, and the fundamental theorem.',
      why: 'Differentiation takes things apart; integration puts them back together.',
      activities: [
        {
          id: 'integrals.learn',
          kind: 'learn',
          title: 'Accumulation, and the theorem that links them',
          body: [
            'Integration accumulates. Geometrically it is the area under a curve; physically, integrating a speed over time gives distance travelled, because area under a rate is a total.',
            'The fundamental theorem of calculus is that differentiation and integration are inverse operations. It is genuinely surprising: the area problem and the tangent problem were studied separately for centuries before the connection was found, and it is what turns integration from an infinite sum into an antiderivative you can look up.',
            'Reverse the power rule: ∫xⁿ dx = x^(n+1)/(n+1) + C. The constant C appears because every function differing by a constant has the same derivative, so an indefinite integral is a family of functions, not one.',
            'A definite integral evaluates the antiderivative at both ends and subtracts, and the C cancels — which is why you can ignore it there.',
          ],
        },
        {
          id: 'integrals.practice',
          kind: 'practice',
          title: 'Integrating',
          questions: [
            n('∫ 2x dx from 0 to 3?', 9, 'x² evaluated 0 to 3 = 9.'),
            n('∫ x² dx from 0 to 3?', 9, 'x³/3 evaluated 0 to 3 = 27/3 = 9.'),
            n('Area under y = 4 from x = 1 to x = 5?', 16, 'A rectangle: 4 × 4.'),
            n('Speed constant at 20 m/s for 6 s. Distance?', 120, 'Integrating a constant rate is multiplication.'),
          ],
        },
      ],
    },

    {
      id: 'calculus_mastery',
      name: 'Calculus',
      category: 'Milestone',
      difficulty: 5,
      estimatedHours: [8, 16],
      requires: [
        { skillId: 'integrals', minLevel: 3 },
        { skillId: 'derivatives', minLevel: 4 },
      ],
      description: 'Both halves, used together on problems that are not pre-labelled.',
      why: 'The capstone. Not new rules — the judgement to know which idea a problem needs.',
      activities: [
        {
          id: 'calculus_mastery.assessment',
          kind: 'assessment',
          title: 'Mixed problems',
          questions: [
            n('A ball\'s height is h(t) = 20t − 5t². At what time is it highest?', 2, 'h\'(t) = 20 − 10t = 0 gives t = 2.'),
            n('And what is that maximum height?', 20, 'h(2) = 40 − 20 = 20.'),
            n('At what time does it return to the ground?', 4, '20t − 5t² = 0 gives t(20 − 5t) = 0, so t = 0 or t = 4.'),
            n('A rectangle has perimeter 20. What width maximises its area?', 5, 'Area = w(10 − w), maximised at w = 5 — a square.'),
            n('Total distance from a speed of 3t m/s over the first 4 seconds?', 24, 'Integrate: 1.5t² from 0 to 4 = 24.'),
          ],
        },
        {
          id: 'calculus_mastery.mastery',
          kind: 'mastery',
          title: 'Explain it without the rules',
          brief: 'Without using the words "power rule" or quoting a formula: explain to someone who knows algebra why the derivative of x² is 2x, and why integrating a speed gives a distance.',
          checklist: [
            'Explained the derivative as a limit of average rates, not as a rule',
            'Showed why the interval shrinking to zero leaves exactly 2x',
            'Explained the integral as accumulation, and area under a rate as a total',
            'Connected the two as inverse operations, and said why that is surprising',
          ],
        },
      ],
    },
  ],
};
