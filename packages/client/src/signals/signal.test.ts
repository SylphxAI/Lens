/**
 * Tests for Signal Implementation (powered by @preact/signals-core)
 */

import { describe, expect, mock, test } from "bun:test";
import { batch, computed, derive, effect, isSignal, signal, toPromise } from "./signal.js";

describe("signal()", () => {
	test("creates signal with initial value", () => {
		const count = signal(0);
		expect(count.value).toBe(0);
	});

	test("updates value on assignment", () => {
		const count = signal(0);
		count.value = 5;
		expect(count.value).toBe(5);
	});

	test("notifies subscribers on change", () => {
		const count = signal(0);
		const values: number[] = [];

		count.subscribe((value) => {
			values.push(value);
		});

		count.value = 1;
		count.value = 2;
		count.value = 3;

		// Preact signals fires immediately with current value on subscribe
		expect(values).toEqual([0, 1, 2, 3]);
	});

	test("unsubscribe stops notifications", () => {
		const count = signal(0);
		const values: number[] = [];

		const unsubscribe = count.subscribe((value) => {
			values.push(value);
		});

		count.value = 1;
		unsubscribe();
		count.value = 2;

		// Includes initial value from subscribe
		expect(values).toEqual([0, 1]);
	});

	test("peek() returns value without tracking", () => {
		const count = signal(5);
		expect(count.peek()).toBe(5);
	});
});

describe("computed()", () => {
	test("derives value from signal", () => {
		const count = signal(5);
		const doubled = computed(() => count.value * 2);

		expect(doubled.value).toBe(10);
	});

	test("updates when dependency changes", () => {
		const count = signal(5);
		const doubled = computed(() => count.value * 2);

		count.value = 10;
		expect(doubled.value).toBe(20);
	});

	test("tracks multiple dependencies", () => {
		const a = signal(1);
		const b = signal(2);
		const sum = computed(() => a.value + b.value);

		expect(sum.value).toBe(3);

		a.value = 10;
		expect(sum.value).toBe(12);

		b.value = 20;
		expect(sum.value).toBe(30);
	});

	test("chains computed signals", () => {
		const count = signal(2);
		const doubled = computed(() => count.value * 2);
		const quadrupled = computed(() => doubled.value * 2);

		expect(quadrupled.value).toBe(8);

		count.value = 5;
		expect(quadrupled.value).toBe(20);
	});
});

describe("effect()", () => {
	test("runs immediately", () => {
		const callback = mock(() => {});
		const dispose = effect(callback);
		expect(callback).toHaveBeenCalledTimes(1);
		dispose();
	});

	test("re-runs when dependency changes", () => {
		const count = signal(0);
		const values: number[] = [];

		const dispose = effect(() => {
			values.push(count.value);
		});

		count.value = 1;
		count.value = 2;

		expect(values).toEqual([0, 1, 2]);
		dispose();
	});

	test("dispose stops re-runs", () => {
		const count = signal(0);
		const values: number[] = [];

		const dispose = effect(() => {
			values.push(count.value);
		});

		count.value = 1;
		dispose();
		count.value = 2;

		expect(values).toEqual([0, 1]);
	});
});

describe("batch()", () => {
	test("batches multiple updates", () => {
		const a = signal(1);
		const b = signal(2);
		const sum = computed(() => a.value + b.value);

		let callCount = 0;
		const dispose = effect(() => {
			sum.value;
			callCount++;
		});

		callCount = 0; // Reset after initial effect run

		batch(() => {
			a.value = 10;
			b.value = 20;
		});

		// Should only trigger one re-computation
		expect(callCount).toBe(1);
		expect(sum.value).toBe(30);
		dispose();
	});
});

describe("Utilities", () => {
	test("isSignal() detects signals", () => {
		const sig = signal(1);
		const comp = computed(() => sig.value);

		expect(isSignal(sig)).toBe(true);
		expect(isSignal(comp)).toBe(true);
		expect(isSignal({})).toBe(false);
		expect(isSignal(null)).toBe(false);
		expect(isSignal(1)).toBe(false);
	});

	test("isSignal() handles edge cases", () => {
		// Test objects with partial signal interface
		expect(isSignal({ value: 1 })).toBe(false);
		expect(isSignal({ value: 1, peek: () => {} })).toBe(false);
		expect(isSignal({ value: 1, subscribe: () => {} })).toBe(false);
		expect(isSignal({ peek: () => {}, subscribe: () => {} })).toBe(false);

		// Test primitive values
		expect(isSignal(undefined)).toBe(false);
		expect(isSignal("")).toBe(false);
		expect(isSignal(0)).toBe(false);
		expect(isSignal(false)).toBe(false);

		// Test arrays and functions
		expect(isSignal([])).toBe(false);
		expect(isSignal(() => {})).toBe(false);
	});

	test("toPromise() resolves when signal changes", async () => {
		const count = signal(0);

		// Start the promise
		const promise = toPromise(count);

		// Change the signal value
		count.value = 42;

		// Promise should resolve with the new value
		const result = await promise;
		expect(result).toBe(42);
	});

	test("toPromise() resolves immediately if signal changes synchronously", async () => {
		const count = signal(0);

		// Start the promise and change value immediately
		const promise = toPromise(count);
		count.value = 100;

		const result = await promise;
		expect(result).toBe(100);
	});

	test("toPromise() unsubscribes after resolving", async () => {
		const count = signal(0);
		const _values: number[] = [];

		// Track all subscriptions
		const originalSubscribe = count.subscribe.bind(count);
		let unsubscribeCalled = false;

		count.subscribe = (fn) => {
			const unsub = originalSubscribe(fn);
			return () => {
				unsubscribeCalled = true;
				unsub();
			};
		};

		const promise = toPromise(count);
		count.value = 1;

		await promise;

		// Verify unsubscribe was called
		expect(unsubscribeCalled).toBe(true);
	});

	test("toPromise() with multiple rapid changes", async () => {
		const count = signal(0);

		const promise = toPromise(count);

		// Make multiple changes - promise should resolve with first change
		count.value = 1;
		count.value = 2;
		count.value = 3;

		const result = await promise;
		expect(result).toBe(1);
	});

	test("derive() combines multiple signals", () => {
		const a = signal(1);
		const b = signal(2);
		const c = signal(3);

		const sum = derive([a, b, c], (values) => values.reduce((acc, v) => acc + v, 0));

		expect(sum.value).toBe(6);

		a.value = 10;
		expect(sum.value).toBe(15);
	});

	test("derive() with empty signals array", () => {
		const result = derive([], (values) => values.length);
		expect(result.value).toBe(0);
	});

	test("derive() with complex transformation", () => {
		const firstName = signal("John");
		const lastName = signal("Doe");
		const ageSignal = signal(30);

		const profile = derive([firstName, lastName, ageSignal] as const, ([first, last, age]) => ({
			fullName: `${first} ${last}`,
			age,
			isAdult: age >= 18,
		}));

		expect(profile.value).toEqual({
			fullName: "John Doe",
			age: 30,
			isAdult: true,
		});

		firstName.value = "Jane";
		expect((profile.value as { fullName: string }).fullName).toBe("Jane Doe");

		ageSignal.value = 16;
		expect((profile.value as { isAdult: boolean }).isAdult).toBe(false);
	});
});

describe("Integration Examples", () => {
	test("todo list example", () => {
		interface Todo {
			id: number;
			text: string;
			done: boolean;
		}

		const todos = signal<Todo[]>([
			{ id: 1, text: "Learn signals", done: false },
			{ id: 2, text: "Build app", done: false },
		]);

		const completedCount = computed(() => todos.value.filter((t) => t.done).length);
		const pendingCount = computed(() => todos.value.filter((t) => !t.done).length);

		expect(completedCount.value).toBe(0);
		expect(pendingCount.value).toBe(2);

		// Complete a todo
		todos.value = todos.value.map((t) => (t.id === 1 ? { ...t, done: true } : t));

		expect(completedCount.value).toBe(1);
		expect(pendingCount.value).toBe(1);
	});

	test("form state example", () => {
		const email = signal("");
		const password = signal("");

		const isEmailValid = computed(() => email.value.includes("@"));
		const isPasswordValid = computed(() => password.value.length >= 8);
		const isFormValid = computed(() => isEmailValid.value && isPasswordValid.value);

		expect(isFormValid.value).toBe(false);

		email.value = "test@example.com";
		expect(isEmailValid.value).toBe(true);
		expect(isFormValid.value).toBe(false);

		password.value = "password123";
		expect(isPasswordValid.value).toBe(true);
		expect(isFormValid.value).toBe(true);
	});
});
