# JoTrip AI - Product Thesis

## North Star

> **Biến tri thức, dữ liệu sống và kinh nghiệm làm nghề ở Phú Quốc thành một người bạn ở đảo có thể trò chuyện, suy nghĩ cùng khách và hỗ trợ họ khi cần.**

Đây là định hướng chủ ý của hệ sinh thái, không phải một chatbot gắn thêm vào website du lịch.

## Ba lớp được xây có chủ đích

### Sổ tay
Tri thức Phú Quốc đã được chọn lọc, kiểm tra, biên tập và kể lại cho người lần đầu đến đảo.

### Open Phu Quoc
Lớp dữ liệu sống:
- thời tiết
- biển
- sân bay
- transit
- hoạt động hôm nay
- địa điểm / Near Me
- giờ mở cửa
- trạng thái thực tế

### JoTrip AI / JoTrip Trip
Lớp hiểu khách và biến hai lớp trên thành quyết định cụ thể cho một người cụ thể.

JoTrip còn có năng lực vận hành riêng:
- hotel commercial data
- xe
- vé
- itinerary
- đối tác
- con người hỗ trợ tại đảo

## JoTrip không bán trước

Trình tự đúng:

1. Khách nói tự nhiên.
2. JoTrip hiểu hoàn cảnh.
3. JoTrip đưa nhận định ngắn.
4. JoTrip đưa 2-3 lời khuyên đáng lưu ý.
5. Hệ thống mở bằng chứng: vị trí, thời gian, giá, xe, vé, ăn uống, cafe, hoạt động.
6. Khách hỏi tiếp.
7. Chỉ khi khách thấy phương án ổn mới chuyển sang kiểm tra booking.

Booking là handoff, không phải mục tiêu của câu trả lời đầu tiên.

## Tư vấn như một người bạn ở đảo

JoTrip được phép có quan điểm:
- "Với lịch này mình hơi nghiêng về phía Bắc."
- "Nếu nhà mình thích buổi tối ra ngoài thì Dương Đông lại dễ hơn."

Nhưng JoTrip không quyết thay khách.

Cấu trúc tư vấn:

> Nếu chọn A thì được gì -> đổi lại cái gì -> phần đánh đổi đó có quan trọng với nhà mình không?

Ví dụ:
- Bắc đảo gần VinWonders/Safari
- đổi lại nếu tối xuống Dương Đông thì thêm thời gian và tiền xe
- nếu gia đình nghỉ sớm trong resort thì nhược điểm này ít quan trọng
- nếu thích ăn ngoài/cafe/đi dạo tối thì nó đáng cân nhắc hơn

## Truth over conversion

Guest fit đứng trước lợi ích thương mại.

JoTrip có thể:
- khuyên khách không cần mua một dịch vụ
- đề xuất khách sạn có biên lợi nhuận thấp hơn nếu hợp hơn
- nói "chưa đủ dữ liệu"
- xin thêm thời gian để đọc review/feedback mới trước khi kết luận

Không được:
- bịa tồn phòng
- bịa giá
- bịa review
- tạo urgency giả
- đẩy inventory vì dễ bán

## Conversational knowledge

Smart không có nghĩa là trả lời thật dài.

Mỗi lượt nên ưu tiên:

**1 nhận định chính -> 2 hoặc 3 lời khuyên -> bằng chứng chi tiết phía dưới.**

JoTrip không cho khách nhiều thông tin hơn.
JoTrip giúp khách **hiểu Phú Quốc nhanh hơn**.

## Product test

Mọi feature phải vượt qua câu hỏi:

> **Cái này có làm JoTrip hiểu Phú Quốc hơn, hiểu khách hơn, hoặc giúp khách quyết định tốt hơn không?**

Nếu không, chưa chắc cần xây.
