# Networking Basics — Example Deck

A small example deck that demonstrates the Recall question format: markdown
multiple-choice questions with optional CLI and topology exhibits. Use it as a
template for building your own decks, or import decks from a URL on the Import page.

## Module 1 — Ethernet and IP fundamentals

### Ethernet frames

### Checkpoint networking-start — Build your packet-forwarding mental model

<!-- Sources: Module 1 questions Q1.1–Q1.5 -->

#### Essentials

- Ethernet delivers frames inside a local broadcast domain. A MAC address is 48 bits, and the all-ones destination address reaches every station in that domain.
- An IPv4 host uses its subnet mask to decide whether a destination is local. Remote traffic is sent to a default gateway, and longest-prefix matching selects the most specific route.
- ARP resolves a local IPv4 address to a MAC address. UDP, by contrast, is a transport protocol that provides no delivery, ordering, or flow-control guarantee.

#### Key takeaway

Ethernet handles local frame delivery, IP chooses the routed destination, and ARP supplies the Layer 2 address needed for the next local hop.

**Q1.1** How long is a MAC address?

- A. 32 bits
- B. 48 bits
- C. 64 bits
- D. 128 bits

<details><summary>Answer</summary>

**B** — MAC addresses are 48 bits (6 bytes), usually written as six hexadecimal
pairs such as aa:bb:cc:dd:ee:ff. The first three bytes identify the vendor (OUI).

</details>

**Q1.2** Which destination MAC address does a host use to send a frame to every station in its broadcast domain?

- A. 00:00:00:00:00:00
- B. The MAC address of the default gateway
- C. ff:ff:ff:ff:ff:ff
- D. 01:00:5e:00:00:01

<details><summary>Answer</summary>

**C** — The all-ones address ff:ff:ff:ff:ff:ff is the Ethernet broadcast address.
Switches flood such frames out of every port in the VLAN. 01:00:5e:… prefixes are
used for IPv4 multicast, not broadcast.

</details>

### IP addressing

**Q1.3** A host is configured with the address 10.20.30.40/26. What is the network address of its subnet?

- A. 10.20.30.0
- B. 10.20.30.32
- C. 10.20.30.40
- D. 10.20.30.64

<details><summary>Answer</summary>

**A** — A /26 leaves 6 host bits, so subnets start every 64 addresses: .0, .64,
.128, .192. The address .40 falls into the 10.20.30.0 – 10.20.30.63 range, so the
network address is 10.20.30.0.

</details>

**Q1.4** Consider the exhibit. A host tries to reach 192.0.2.10 and receives the output shown. Which conclusion is correct?

```cli
$ ip route
default via 192.168.1.1 dev eth0
192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.50

$ ping -c 2 192.0.2.10
PING 192.0.2.10 (192.0.2.10) 56(84) bytes of data.
From 192.168.1.1 icmp_seq=1 Destination Net Unreachable
From 192.168.1.1 icmp_seq=2 Destination Net Unreachable
```

- A. The host has no default route, so the packets never leave the host.
- B. The default gateway received the packets but has no route toward 192.0.2.10.
- C. The host could not resolve the MAC address of 192.0.2.10.
- D. A firewall on the destination silently dropped the ICMP echo requests.

<details><summary>Answer</summary>

**B** — The "Destination Net Unreachable" messages come *from 192.168.1.1*, the
default gateway. The host successfully forwarded the packets to its gateway; the
gateway then found no route toward the destination network and reported that back.
A missing default route would fail locally, and a silent firewall drop would show
timeouts, not ICMP errors.

</details>

**Q1.5** Which statement about UDP is correct?

- A. It retransmits lost datagrams after a timeout.
- B. It establishes a connection with a three-way handshake.
- C. It provides no delivery guarantee and no flow control.
- D. It guarantees in-order delivery using sequence numbers.

<details><summary>Answer</summary>

**C** — UDP is connectionless and best-effort: no handshake, no acknowledgements,
no retransmission, no ordering. Applications that need reliability either use TCP
or implement it themselves on top of UDP.

</details>

## Module 2 — Switching and routing

### Leaf-spine fabrics

**Q2.1** Consider the exhibit. Server A sends traffic to Server B. How many switches does the traffic pass through?

```topology
{
  "nodes": [
    { "id": "spine1", "kind": "spine", "label": "Spine 1" },
    { "id": "spine2", "kind": "spine", "label": "Spine 2" },
    { "id": "leaf1", "kind": "leaf", "label": "Leaf 1" },
    { "id": "leaf2", "kind": "leaf", "label": "Leaf 2" },
    { "id": "srva", "kind": "server", "label": "Server A" },
    { "id": "srvb", "kind": "server", "label": "Server B" }
  ],
  "links": [
    { "from": "spine1", "to": "leaf1" },
    { "from": "spine1", "to": "leaf2" },
    { "from": "spine2", "to": "leaf1" },
    { "from": "spine2", "to": "leaf2" },
    { "from": "leaf1", "to": "srva" },
    { "from": "leaf2", "to": "srvb" }
  ]
}
```

- A. One — the two leaf switches are directly connected.
- B. Two — traffic goes from Leaf 1 straight to Leaf 2.
- C. Three — Leaf 1, one of the spines, then Leaf 2.
- D. Four — traffic always crosses both spines.

<details><summary>Answer</summary>

**C** — In a leaf-spine fabric, leaves are never connected to each other; all
inter-leaf traffic goes through a spine. The path is Leaf 1 → Spine 1 *or*
Spine 2 → Leaf 2: three switches. Which spine is used is decided per flow by
ECMP hashing.

</details>

**Q2.2** What is the purpose of a VLAN on a switch?

- A. To increase the link speed between two switches.
- B. To split one physical switch into multiple broadcast domains.
- C. To encrypt traffic between access ports.
- D. To aggregate multiple physical links into one logical link.

<details><summary>Answer</summary>

**B** — A VLAN partitions a switch into separate Layer 2 broadcast domains: a
broadcast received in VLAN 10 is only flooded to other VLAN 10 ports. Link
aggregation (option D) is done with LAG/LACP, not VLANs.

</details>

### Forwarding decisions

**Q2.3** Consider the exhibit. To which next hop does the router forward a packet destined to 172.16.5.20?

```cli
R1# show ip route
S*  0.0.0.0/0      via 10.0.0.1
S   172.16.0.0/16  via 10.0.0.2
S   172.16.5.0/24  via 10.0.0.3
```

- A. 10.0.0.1, via the route 0.0.0.0/0
- B. 10.0.0.2, via the route 172.16.0.0/16
- C. 10.0.0.3, via the route 172.16.5.0/24
- D. The packet is dropped because the routes overlap.

<details><summary>Answer</summary>

**C** — Routers always use the longest (most specific) matching prefix.
172.16.5.0/24 matches 172.16.5.20 and is more specific than 172.16.0.0/16 and the
default route, so its next hop 10.0.0.3 wins. Overlapping routes are normal, not
an error.

</details>

**Q2.4** What does a host send when it knows the IP address of a neighbor on its subnet but not its MAC address?

- A. An ICMP echo request to the neighbor.
- B. A DNS query for the neighbor's name.
- C. A DHCP discover message.
- D. An ARP request broadcast on the local network.

<details><summary>Answer</summary>

**D** — ARP resolves IPv4 addresses to MAC addresses: the host broadcasts
"who has this IP?" and the owner replies with its MAC address, which the host
then caches. DNS maps names to IP addresses, and DHCP assigns addresses — neither
resolves MAC addresses.

</details>

**Q2.5** Why does a leaf-spine data center fabric typically use eBGP between leaves and spines instead of a Layer 2 design?

- A. eBGP encrypts all traffic between the switches.
- B. Layer 3 with ECMP uses all uplinks, while spanning tree would block redundant Layer 2 links.
- C. eBGP is required to support VLAN trunking on the uplinks.
- D. Layer 2 designs cannot span more than two switches.

<details><summary>Answer</summary>

**B** — In a Layer 2 fabric, spanning tree must block redundant links to prevent
loops, wasting capacity. A routed (Layer 3) fabric has no spanning tree; equal-cost
multipath routing spreads flows across *all* leaf-spine uplinks, and eBGP with one
AS per leaf is the common, simple way to distribute the routes.

</details>
