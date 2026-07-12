In the context of CRDTs, tombstones are special markers that record the fact that an element was deleted. When an element is removed, it isn't deleted immediately and without a trace; instead it is kept as a "deletion marker." (deferred physical deletion)

**Operation-based CRDT:**  
Here the operations themselves can carry information about ordering or causality (for example, logical clocks), which makes it possible to apply them correctly without having to explicitly store a version in the replica.

-   **Causal delivery guarantee:**  
    For operations to be applied correctly, they must be delivered to all replicas in causal order. This means that if operation A depends on operation B, then every node will see B before A. Reliable causal broadcast algorithms are usually used for this.

the **causal broadcast** protocol (carries vector clocks or other dependency identifiers)

For example, if you have three nodes, the vector might look like \[2, 5, 3\]. This means that:

-   the first node performed 2 events,
-   the second node — 5 events,
-   the third node — 3 events.

L – the local time vector of the current replica (the node that receives the operation). Each element L\[i\] shows how many operations from node i have already been applied on this replica.

v – the time vector that arrived together with the operation. Each element v\[i\] indicates how many operations from node i the sender (the one who generated the operation) considered already performed at the moment that operation was generated.

i - the identifier of any node in the system (for example, A, B, C). It is not necessarily equal to the current node that is checking the operation.

For the sender (node k): L\[k\] == v\[k\] - 1 means that all previous operations from this same node (k) must already have been applied on the current replica. If, for example, an operation from node k carries the label v\[k\] = 2, then exactly 1 operation from k must have been applied on the current replica (that is, L\[k\] equals 1) before this new operation can be applied.

For the remaining nodes (denoted by i, where i ≠ k) the rule looks like this: L\[i\] >= v\[i\]

This condition says that all operations from nodes i that the sender recorded in vector v must already have been received on the current replica.

Replica B increments its own counter (L\[B\]) only when it generates its own operation.

-   **Operation log (operational journal):**  
    Some systems may use a log that records the sequence of performed operations. This helps not only with replication, but also with debugging or recovering state in case of failures.
    
-   **Prepare/effector model:**  
    When an operation is performed, a preparatory (prepare) phase is first computed, which generates the operation, and then this operation is applied on all nodes via the effector (effect), which guarantees that all replicas converge to the same state.
    

```json
{
"id": "node1_id",
"value": "objectData",
"prev": null,
"next": "node2_id",
"internal": "node3"
}
```

## Types of CRDT

-   **G-Counter** — (grow-only) a monotonically increasing counter
-   **PN-Counter** — (positive-negative) a counter that can be decremented
-   **LWW-Register** — (last-writer-wins) a register with the principle "the last write takes priority"
-   **MV-Register** — (multi-value) a register with multiple values
-   **G-Set** — a set of elements without removal
-   **2P-Set** — with priority removal
-   **PN-Set** — uses a counter of add/remove operations
-   **LWW-Set** — with operation-time priority
-   **OR-Set** — (observed-remove) a list with identifiers

## Mathematical foundation

1.  **Idempotence** — protection against duplicate updates
2.  **Commutativity** — independence from the order of updates
3.  **Partial order** — Reflexivity + Transitivity + Antisymmetry
4.  **Semilattice** — a partially ordered set with a least upper (greatest lower) bound
5.  **Version vector** — a vector whose dimension equals the number of nodes; each node increments its own value on an event; during synchronization it lets you determine which replica has the old/new data

The key idea of CRDTs: operations must be commutative and associative — the order in which they are applied does not affect the final state. Semilattices formally describe these properties.

## Reliable delivery protocol

-   If the effector is delivered to all replicas in the prescribed order — concurrent effectors are commutative
-   If the effector is delivered without regard to order — all effectors are commutative
-   If the effector may be delivered multiple times — it must be idempotent
-   Some implementations use queues (Kafka) as part of the delivery protocol

[https://thom.ee/blog/crdt-vs-operational-transformation](https://thom.ee/blog/crdt-vs-operational-transformation) [https://inria.hal.science/inria-00629503/document](https://inria.hal.science/inria-00629503/document) [https://www.bartoszsypytkowski.com/the-state-of-a-state-based-crdts/](https://www.bartoszsypytkowski.com/the-state-of-a-state-based-crdts/)

## (merged from NAMESPACE (sandbox) OPS (CAP) (CRTD) note)

There are also Replicated State Machines (RSM).  
Operational Transformation (OT) - a data replication technique that makes it possible to ensure data consistency in collaborative systems such as Google Docs, Microsoft Office, etc.  
Distributed Version Control Systems (DVCS) - version control systems that allow code and other documents to be stored and their versions managed in a distributed way.

Strong, Eventual, Strong Eventual

Operation based CRDT-s  
State based CRDT-s

Commutativity. independence from the order of updates  
Idempotence. protection against duplicate updates

State-based (convergent: CvRDT, state-based): in this case it is not individual updates that are sent, but the entire data structure as a whole (that is, the whole list, in the case of a list). The data structure must support the operations:

Structures

G-Counter: (grow-only) a monotonically increasing counter  
PN-Counter: (positive-negative) a counter that can be decremented  
LWW-Register: (last-writer-wins) a register with the principle that the last write takes priority  
MV-Register: (multi-value) a register with multiple values  
G-Set: a set of elements without removal  
2P-Set: with priority removal  
PN-Set: uses a counter of add/remove operations  
LWW-Set: with operation-time priority  
OR-Set: (observed-remove) a list with identifiers

1.  Idempotence
2.  Commutativity
3.  Partial order  
    Reflexivity + Transitivity + Antisymmetry
4.  Semilattice  
    A partially ordered set with a least upper (greatest lower) bound
5.  Version vector  
    A vector whose dimension equals the number of nodes, and each node increments its own value in the vector when some particular event occurs. During synchronization the data is transmitted together with this vector, and this introduces an ordering relation, which makes it possible to determine which replica has the old/new data.

The key idea of CRDTs is that operations performed on the data must be commutative and associative, that is, the order in which they are applied should not affect the final state of the data. Semilattices make it possible to describe such properties and guarantee that any two operations on the data will be commutative.

CRDTs are connected to semilattices because the theory of semilattices provides mathematical tools for formally defining and analyzing the conflicts that arise in distributed systems, as well as for ensuring data consistency in such systems.

Reliable delivery protocol  
If the effector is delivered to all replicas in accordance with the prescribed order (for the given type), then concurrent effectors are commutative, or  
If the effector is delivered to all replicas without regard to order, then all effectors are commutative.  
In the case where the effector may be delivered multiple times, it must be idempotent  
Some implementations use queues (Kafka) as part of the delivery protocol.

Examples: distributed version control systems.
