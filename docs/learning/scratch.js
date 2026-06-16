const data = { count: 0 };
console.log(data.count ?? 99); // careful — is 0 null/undefined?
console.log(data.missing ?? 99);
console.log(data.nested?.deep);
